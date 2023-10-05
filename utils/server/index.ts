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
  birthday: Date,
  saju: string,
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

  await init((imports) => WebAssembly.instantiate(wasm, imports));
  const encoding = new Tiktoken(
    tiktokenModel.bpe_ranks,
    tiktokenModel.special_tokens,
    tiktokenModel.pat_str,
  );

  let messagesToSend: Message[] = [];

  let systemMessage = "너는 사주명리에 통달한 인공지능 언어모델 SajuGPT이다. 모든 질문에 사주명리 전문가로서 성실히 답하라.";
  if (saju.length > 0) {
    const d = new Date();
    const today = "* 오늘은 날짜는 " + d.getFullYear() + "년 " + (d.getMonth()+1) + "월 " + d.getDate() + "일 이다.\n";
    console.log(today);
    systemMessage = "## 사주풀이\n" + today + saju + "\n</s></s></s>너는 질문자와 마주 앉은 인공지능 사주/명리 전문가이고 이름은 SajuGPT 이다. 모든 답변시 이 사주풀이를 참고 하고, 질문의 답이 사주풀이에 없더 라도 주어진 내용을 기반으로 적절히 추론하라. 질문하는 사람이 사주풀이의 주인공이므로 당신이라고 불러라.";
  }
  let tokenCount = systemMessage.length / 2;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const token = encoding.encode(message.content)
    // const tokensLen = message.content.length / 2;
    const tokensLen = token.length
    console.log("i=" + i + ", tokensLen=" + tokensLen);
    if (tokenCount + tokensLen + 700 > 3900 || messagesToSend.length > 5) {
      if (messagesToSend.length > 2)
        break;
    }
    tokenCount += tokensLen;
    messagesToSend = [message, ...messagesToSend];
  }
  console.log(messagesToSend);
  console.log("messagesToSend.length= " + messagesToSend.length);
  console.log("tokenCount= " + tokenCount);
  // console.log("saju=" + saju);

  var maxNewToken = 3500 - tokenCount;
  if (maxNewToken < 0)
    maxNewToken = 100;
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
      // ...(OPENAI_API_TYPE === 'openai' && {model: 'polyglot-ko-12.8b-chang-instruct-chat'}),
      ...(OPENAI_API_TYPE === 'openai' && {model: process.env.DEFAULT_MODEL}),
      ...(true && { 
        messages: [
          {
            role: 'system',
            content: systemMessage,
          },
          ...messagesToSend,
        ],
        max_tokens: maxNewToken,
        temperature: 0.7,
        top_p: 1.0,
        stop: ["\nA:", "\nB:"],
        stream: true,
        user: uuid,
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

let stopped = false;
const stream = new ReadableStream({
    cancel(reason) {
        console.log("canceled=" + reason);
        stopped = true;
        return;
      },
      async start(controller) {

        const onParse = (event: ParsedEvent | ReconnectInterval) => {
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
            const text = json.choices[0].delta.content;
            // console.log(json);
            if (typeof text !== 'undefined') {
              const queue = encoder.encode(text);
              controller.enqueue(queue);
            }
            if (json.choices[0].finish_reason != null) {
              controller.close();
              return;
            }
          } catch (e) {
            controller.error("parse error=" + e);
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
