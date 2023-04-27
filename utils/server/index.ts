import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';

import { AZURE_DEPLOYMENT_ID, OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION } from '../app/const';

import {
  ParsedEvent,
  ReconnectInterval,
  createParser,
} from 'eventsource-parser';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}

var reader_save: ReadableStreamDefaultReader<Uint8Array> | undefined;
  
export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  temperature : number,
  key: string,
  messages: Message[],
) => {
  let basaran = true;
  let stopped = false;
  if (systemPrompt == "abort") {
    await reader_save?.cancel();
    global.Foo = true;
    console.log("aborted !!!!!!!!!!!!!!!!!!!!!!!!!=" + global.Foo)
    stopped = true;
    return;
  }
  let url = `${OPENAI_API_HOST}/v1/chat/completions`;
  if (basaran) {
    url = `${OPENAI_API_HOST}/v1/completions`;
  } 
  if (OPENAI_API_TYPE === 'azure') {
    url = `${OPENAI_API_HOST}/openai/deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`;
  }
  //console.log(messages)
  let prompt = "";
  for (const m of messages) {
    if (m.role === 'user') {
      prompt += "B:" + m.content.trim() + "\nA:";
    } else {
      prompt += m.content + "\n";
    }
  }
  //console.log(prompt);
  //console.log("temperature=" + temperature);

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(OPENAI_API_TYPE === 'openai' && {
        Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`
      }),
      ...(OPENAI_API_TYPE === 'azure' && {
        'api-key': `${key ? key : process.env.OPENAI_API_KEY}`
      }),
      ...((OPENAI_API_TYPE === 'openai' && OPENAI_ORGANIZATION) && {
        'OpenAI-Organization': OPENAI_ORGANIZATION,
      }),
    },
    method: 'POST',
    body: JSON.stringify({
      ...(OPENAI_API_TYPE === 'openai' && {model: model.id}),
      ...(basaran !== true && { 
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...messages,
        ],
        max_tokens: 1000,
        temperature: temperature,
        stream: true,
      }),
      ...(basaran && {
        prompt: prompt,
        max_tokens: 500,
        temperature: temperature,
        top_p: 0.65,
        stream: true,
      }),
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }

  // let reader = res.body?.getReader();
  // let no_gen_count = 0;

  let gen_concat = "";
  const stream2 = new ReadableStream({
    cancel(reason) {
      console.log("canceled=" + reason);
      global.Foo = true;
      return;
    },
    async start(controller) {
      console.log("start start = ")
      gen_concat = "";
      return;
    },
    async pull(controller) {
      reader_save = reader;
      let rr = null;
      try {
        rr = await reader?.read();
        if (rr?.done) {
          reader?.cancel();
          console.log("stopped = ");
          controller.close();
          return;
        }
      } catch (ex) {
        console.log("ex=" + ex);
        return;
      }
      // console.log(rr?.value); 
      const dec = decoder.decode(rr?.value)
      // console.log(dec);
      const json = JSON.parse(dec.replace("data: ", ""));
      let text = json.choices[0].text;
      if (text.length == 0) {
        console.log("text len 0 = " + no_gen_count)
        no_gen_count += 1;
        if (no_gen_count > 1) {
          console.log("stopped no gen = " + no_gen_count)
          controller.close();
          stopped = true;
          reader?.cancel();
        }
        return;
      }
      // console.log("[" + text + "]=");
      gen_concat += text;
      if (gen_concat.indexOf("\nB") >= 0) {
          console.log("stopped stop word = " + gen_concat)
          controller.close();
          stopped = true;
          reader?.cancel();
          return;
      }
      no_gen_count = 0;
      const queue = encoder.encode(text);
      controller.enqueue(queue);
      // reader?.cancel();
      // console.log("stopped = ");
      // controller.close();
    }
  })

  const stream = new ReadableStream({
      cancel(reason) {
        console.log("canceled=" + reason);
        global.Foo = true;
        return;
      },
      async start(controller) {
        let no_gen_count = 0;
        let gen_concat = "";
        const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (!basaran) {
          if (event.type === 'event') {
            const data = event.data;

            try {
              const json = JSON.parse(data);
              if (json.choices[0].finish_reason != null) {
                controller.close();
                return;
              }
              const text = json.choices[0].delta.content;
              const queue = encoder.encode(text);
              controller.enqueue(queue);
            } catch (e) {
              controller.error(e);
            }
          }
        } else {
          const aborted = global.Foo;
          if (aborted) {
            controller.close();
            stopped = true;
            return;
          }
          if (event.type === 'event') {
            const data = event.data;

            try {
              const json = JSON.parse(data);
              let text = json.choices[0].text;
              if (text.length == 0) {
                no_gen_count += 1;
                if (no_gen_count > 5) {
                  console.log("stopped no gen = " + no_gen_count)
                  controller.close();
                  stopped = true;
                }
                return;
              }
              // console.log("[" + text + "]=" + aborted);
              gen_concat += text;
              if (gen_concat.indexOf("\nB") >= 0) {
                  console.log("stopped stop word = " + gen_concat)
                  controller.close();
                  stopped = true;
                  return;
              }
              no_gen_count = 0;
              const queue = encoder.encode(text);
              controller.enqueue(queue);
            } catch (e) {
              controller.error(e);
            }
          } 
        }
      };

      const parser = createParser(onParse);
      let i = 0;
      for await (const chunk of res.body as any) {
        i += 1;
        if (stopped || global.Foo || i > 100) {
          console.log("aborted!!!!")
          stopped = true;
          controller.close();
          break;
        }
        const dec = decoder.decode(chunk)
        parser.feed(dec);
      }
    },
  });

  return stream;
};
