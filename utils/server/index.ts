import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';

// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';

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

global.aborted = new Map();


export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  temperature : number,
  key: string,
  messages: Message[],
  uuid: string,
) => {
  // console.log("OpenAIStream uuid = " + systemPrompt + "," + uuid);
  let basaran = false;
  if (systemPrompt.startsWith("abort")) {
    global.aborted.set(uuid, true); 
    console.log("aborted !!!!!!!!!!!!!!!!!!!!!!!!!=" + [...global.aborted.keys()])
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
  // let prompt = "";
  // for (const m of messages) {
  //   if (m.role === 'user') {
  //     prompt += "B: " + m.content.trim() + "\nA: ";
  //   } else {
  //     prompt += m.content.trim() + "\n";
  //   }
  // }
  // prompt = prompt.trim();
  // let pp = prompt.split("B:")
  // if (pp.length > 3) 
  //   pp[pp.length - 2] = pp[pp.length - 2] + "<|endoftext|><|endoftext|><|endoftext|>";
  // prompt = pp.join("B:");
  // console.log(prompt);
  //console.log("temperature=" + temperature);

  await init((imports) => WebAssembly.instantiate(wasm, imports));
  const encoding = new Tiktoken(
    tiktokenModel.bpe_ranks,
    tiktokenModel.special_tokens,
    tiktokenModel.pat_str,
  );

  let tokenCount = 0;
  let messagesToSend: Message[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const token = encoding.encode(message.content)
    // const tokensLen = message.content.length / 2;
    const tokensLen = token.length
    if (tokenCount + tokensLen + 1000 > 2000 || messagesToSend.length > 4) {
      break;
    }
    tokenCount += tokensLen;
    messagesToSend = [message, ...messagesToSend];
  }
  console.log("messagesToSend.length= " + messagesToSend.length);
  console.log("tokenCount= " + tokenCount);

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
      ...(OPENAI_API_TYPE === 'openai' && {model: 'polyglot-ko-12.8b-chang-instruct-chat'}),
      ...(true && { 
        messages: [
          {
            role: 'system',
            content: "너는 사주 명리학 전문 인공지능이다. 다른 분야도 잘 하지만 특히 사주 명리에 능통하다.",
          },
          ...messagesToSend,
        ],
        max_tokens: 700,
        temperature: temperature,
        top_p: 1.0,
        stop: ["\nA:", "\nB:"],
        stream: true,
        user: uuid,
      }),
      // ...(basaran && {
      //   prompt: prompt,
      //   max_tokens: 1000,
      //   temperature: temperature,
      //   top_p: 0.95,
      //   // logprobs: 5,
      //   stream: true,
      // }),
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

  /*
  let reader = res.body?.getReader();
  let no_gen_count = 0;

  let gen_concat = "";
  const stream2 = new ReadableStream({
    cancel(reason) {
      console.log("canceled=" + reason);
      aborted = true;
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
*/
let stopped = false;
const stream = new ReadableStream({
    cancel(reason) {
        console.log("canceled=" + reason);
        stopped = true;
        return;
      },
      async start(controller) {

        let no_gen_count = 0;
        let gen_concat = "";
        let temp_text = "";
        const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (!basaran) {
          if (global.aborted.has(uuid)) {
            controller.close();
            console.log("stopped = global.aborted.has(uuid)");
            stopped = true;
            return;
          }
          if (event.type === 'event') {
            const data = event.data;

            try {
              const json = JSON.parse(data);
              if (json.choices[0].finish_reason != null) {
                controller.close();
                return;
              }
              const text = json.choices[0].delta.content;
              // console.log(text);
              const queue = encoder.encode(text);
              controller.enqueue(queue);
            } catch (e) {
              controller.error("parse error=" + e);
            }
          }
        } else {
          if (global.aborted.has(uuid)) {
            controller.close();
            console.log("stopped = global.aborted.has(uuid)");
            stopped = true;
            return;
          }
          if (event.type === 'event') {
            const data = event.data;

            try {
              const json = JSON.parse(data);
              let text = json.choices[0].text;
/*
              json.choices.forEach((choice: any) => {
                let graphemes = [...choice.text];

                let logprobs = choice.logprobs;
                if (choice.finish_reason !== null) {
                    console.log("finished=" + choice.finish_reason);
                }
                for (let i = 0; i < logprobs.tokens.length; i++) {
                    let text = "";
                    let start =
                        logprobs.text_offset[i] - logprobs.text_offset[0];
                    if (i + 1 < logprobs.tokens.length) {
                        let end =
                            logprobs.text_offset[i + 1] -
                            logprobs.text_offset[0];
                        text = graphemes.slice(start, end).join("");
                    } else {
                        text = graphemes.slice(start).join("");
                    }

                    let info = {
                        token: logprobs.tokens[i],
                        token_logprob: logprobs.token_logprobs[i],
                        top_logprobs: logprobs.top_logprobs[i],
                    };

                    let prob = Math.exp(logprobs.token_logprobs[i]);

                    if (text.length == 0) {
                      no_gen_count += 1;
                      if (no_gen_count > 10) {
                        console.log("stopped no gen = " + gen_concat)
                        controller.close();
                        stopped = true;
                      }
                      return;
                    }
                    // if (text != text_old)
                    //   console.log("diff=%s, %s", text, text_old);
                    gen_concat += text;
                    temp_text += text;
                    no_gen_count = 0;
                    // console.log("temp_text=[" + temp_text + "]");
                    if (temp_text.indexOf("\n") < 0) {
                      controller.enqueue(encoder.encode(temp_text));
                      temp_text = "";
                    } 
                    if (gen_concat.indexOf("\nB:") >= 0 || gen_concat.indexOf("\nA:") >= 0) {
                      console.log("stopped stop word =" + "\n" + text + "|\n" + temp_text + "|\n" + gen_concat)
                      controller.close();
                      stopped = true;
                      return;
                    }
                    if (temp_text.indexOf("\n") >= 0) {
                      let s = temp_text.indexOf("\n");
                      controller.enqueue(encoder.encode(temp_text.slice(0, s)));
                      temp_text = temp_text.slice(s);
                    }
                    if (temp_text.indexOf("\n") >= 0 && temp_text.length > 5) {
                      controller.enqueue(encoder.encode(temp_text));
                      temp_text = "";
                    }
    
                  }                
              });
*/
              if (text.length == 0) {
                no_gen_count += 1;
                if (no_gen_count > 10) {
                  console.log("stopped no gen = " + gen_concat)
                  controller.close();
                  stopped = true;
                }
                return;
              }
              gen_concat += text;
              temp_text += text;
              no_gen_count = 0;
              // console.log("text, temp_text=[%s] [%s]", text.replace("\n", "/"), temp_text.replace("\n", "/"));
              if (temp_text.indexOf("\n") < 0) {
                controller.enqueue(encoder.encode(temp_text));
                temp_text = "";
              } 
              if (gen_concat.indexOf("\nB:") >= 0 || gen_concat.indexOf("\nA:") >= 0) {
                console.log("stopped stop word =" + "\n" + text + "|\n" + temp_text + "|\n" + gen_concat)
                controller.close();
                stopped = true;
                return;
              }
              if (temp_text.indexOf("\n") >= 0) {
                let s = temp_text.indexOf("\n");
                if (s > 0) {
                  controller.enqueue(encoder.encode(temp_text.slice(0, s)));
                  temp_text = temp_text.slice(s);
                }
              }
              if (temp_text.indexOf("\n") >= 0 && temp_text.length > 5) {
                // console.log("non stop temp_text=[%s]", temp_text.replace("\n", "/"));
                controller.enqueue(encoder.encode(temp_text));
                temp_text = "";
              }
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
        if (stopped || global.aborted.has(uuid)) {
          console.log("stopped or aborted = " + stopped + ", " + [...global.aborted.keys()])
          stopped = false;
          global.aborted.delete(uuid);
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
