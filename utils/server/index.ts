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

export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  temperature : number,
  key: string,
  messages: Message[],
) => {
  let basaran = true;

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
        max_tokens: 2000,
        temperature: temperature,
        top_p: 0.7,
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

  const stream = new ReadableStream({
      async start(controller) {
        let stopped = false;
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
          if (event.type === 'event') {
            const data = event.data;

            try {
              const json = JSON.parse(data);
              let text = json.choices[0].text;
              if (text.length == 0) {
                no_gen_count += 1;
                // console.log("no gen = " + no_gen_count)
                if (no_gen_count > 5) {
                  controller.close();
                  stopped = true;
                }
                return;
              }
              // console.log("[" + text + "]");
              gen_concat += text;
              if (gen_concat.indexOf("\nB") >= 0) {
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
      for await (const chunk of res.body as any) {
        if (stopped) {
          stopped = false;
          break;
        }
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
};
