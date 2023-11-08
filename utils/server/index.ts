import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import { fetchOpenAI } from '@/pages/api/chat';

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

  let messagesToSend: Message[] = [];

  let systemMessage = "너는 사주명리에 통달한 인공지능 언어모델 SajuGPT이다. 모든 질문에 사주명리 전문가로서 성실히 답하라.";
  if (process.env.NEXT_PUBLIC_TITLE != "SajuGPT")
    systemMessage = "너는 세상 모든 지식에 통달한 지식 전문가 ChangGPT이다. 모든 질문에 전문적이고 정확한 답변을 하세요.";
  if (process.env.NEXT_PUBLIC_TITLE == "SajuGPT" && saju.length > 0) {
    // saju = saju.substring(0, 3000);
    const d = new Date();
    const today = "* 오늘은 날짜는 " + d.getFullYear() + "년 " + (d.getMonth()+1) + "월 " + d.getDate() + "일 이다.\n";

    // const index1 = saju.indexOf("### 원국")
    // const index2 = saju.indexOf("### 육합")
    // saju = saju.substring(0, index1) + saju.substring(index2)
    // console.log(saju)
    // let sajuSection = saju.split("\n###");
    // let daewoonIndex = 0;
    // sajuSection.forEach(function(item, index) {
    //   if (item.trim().startsWith('대운\n')) {
    //     daewoonIndex = index;
    //     return;
    //   }
    // });

    // saju = saju.replaceAll("### 세운", "### 당신의 사주 - 세운");
    // saju = saju.replaceAll("### 대운", "### 당신의 사주 - 대운");
    // saju = saju.replaceAll("\n###", "</s>\n###");
    // saju = saju.replace("### 생일(생시)", "### 당신의 생일 정보");
    // saju = saju.replace("### 성별\n남자", "### 당신은 남자입니다.");
    // saju = saju.replace("### 성별\n여자", "### 당신은 여자입니다.");
    // let sajuSummary = sajuSection[1];
    // let birthday = "";
    // if (!sajuSummary.trim().startsWith("사주요약")) {
    //   sajuSummary = sajuSection[daewoonIndex].replace("대운", "").trim();
    //   birthday = sajuSection[1].trim().replace("생일(생시)", "생일 정보:") + sajuSection[2].trim().replace("성별\n", "\n당신의 성별: ");
    //   sajuSummary = "" + sajuSummary + "\n" + birthday;
    // } else 
    //   sajuSummary = sajuSummary.replace("사주요약", "").trim();
    systemMessage = "B: 너는 사주명리에 통달한 인공지능 언어모델 SajuGPT이다. 모든 질문에 사주명리 전문가로서 성실히 답하라.\n\n##대화상대 사주##\n" + today + saju + "\n</s></s></s>대화시 다음 조건을 따른다.\n" 
    + "1. 대화상대는 사주의 주인공이다. 호칭을 당신으로 하라.\n"
    + "1. 위 지문의 내용을 최우선으로 참고하여 답변하라"
    ;
    // messages = [{role: "user", content: "내 사주는?"}, {role: "assistant", content: sajuSummary}, ...messages];
  }

  messagesToSend = messages;
  let last = messagesToSend.length - 1;
  // messagesToSend[last]['content'] = messagesToSend[last]['content'] + "(내 운명이 걸린 일이니 친절한 답변 부탁해요)";
  // const MAX_NUM_MESSAGES = 3;
  // if (messagesToSend.length > MAX_NUM_MESSAGES)
  //   messagesToSend.splice(0, messagesToSend.length - MAX_NUM_MESSAGES);
  // let maxNewToken = 700;
  // while(true) {
  //   const checkLenRes = await fetchOpenAI(systemMessage, messagesToSend, 700, key, "check_length");
  //   if (checkLenRes.status !== 200) {
  //     throw new Error(
  //       "check_length failed"
  //     );
  //   }
  //   // console.log(checkLenRes)
  //   const checkLen = await checkLenRes.json();
  //   console.log(checkLen)
  //   if (checkLen.message !== "ok")
  //     messagesToSend.shift();
  //   else {
  //     maxNewToken = 3900 - checkLen.code;
  //     if (maxNewToken < 0)
  //       maxNewToken = 100;
  //     if (maxNewToken > 800)
  //       maxNewToken = 800;
  //     break;
  //   }
  // }
  // console.log("maxNewToken= " + maxNewToken);

  const res = await fetchOpenAI(systemMessage, messagesToSend, 700, key, uuid);

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
            if (typeof text !== 'undefined' && text != null) {
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
