import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import { fetchOpenAI } from '@/pages/api/chat';
import { Status } from '@/types/status';

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

let status: Status = {aborted: false};
const STATUS = "ABORT_STATUS";

function findSection(sajuSections: string[], sectionName: string): number {
  let i = 0;
  for (const section of sajuSections) {
      if (section.trim().startsWith(sectionName)) {
          break;
      }
      i++;
  }
  return i;
}

function getWonkookTable(sajuSections: string[]): string {
  let wonkookStr = sajuSections[findSection(sajuSections, "원국")].trim();

  const ohang = "木火土金水";
  const josa = "이가가이가";
  let ohangCountStr = "오행은";
  for (let i = 0; i < ohang.length; i++) {
      const char = ohang[i];
      const count = (wonkookStr.match(new RegExp(char, "g")) || []).length;
      ohangCountStr += count !== 0 ? ` ${char}${josa[i]} ${count}개,` : ` ${char}${josa[i]} 없고,`;
  }
  ohangCountStr = ohangCountStr.substring(0, ohangCountStr.length - 1);
  if (ohangCountStr[ohangCountStr.length - 1] === "고") {
      ohangCountStr = `${ohangCountStr.substring(0, ohangCountStr.length - 1)}다. `;
  } else {
      ohangCountStr += "이다. ";
  }

  const col = wonkookStr.split("\n");
  col.splice(2, 1);
  col.splice(0, 1);
  const table: string[][] = [];
  for (const row of col) {
      const cells = row.split("|");
      table.push(cells.slice(1, cells.length - 1));
  }

  const t = table;

  const qmap: { [key: string]: string } = {
      "일주는": `${t[2][1]}${t[3][1]}`,
      "시주는": `${t[2][0]}${t[3][0]}`,
      "월주는": `${t[2][2]}${t[3][2]}`,
      "년주는": `${t[2][3]}${t[3][3]}`,
      "일간은": `${t[2][1]}${t[1][1]}`,
      "일지는": `${t[5][1]}${t[3][1]}${t[4][1]}`,
      "시지는": `${t[5][0]}${t[3][0]}${t[4][0]}`,
      "월지는": `${t[5][2]}${t[3][2]}${t[4][2]}`,
      "년지는": `${t[5][3]}${t[3][3]}${t[4][3]}`,
      "시간은": `${t[0][0]}${t[2][0]}${t[1][0]}`,
      "월간은": `${t[0][2]}${t[2][2]}${t[1][2]}`,
      "년간은": `${t[0][3]}${t[2][3]}${t[1][3]}`,
  };
  let wonkook = `時柱는 ${qmap["시주는"]} 時干은 ${qmap["시간은"]} 時支는 ${qmap["시지는"]}, 日柱는 ${qmap["일주는"]} 日干은 ${qmap["일간은"]} 日支는 ${qmap["일지는"]}, 月柱는 ${qmap["월주는"]} 月干은 ${qmap["월간은"]} 月支는 ${qmap["월지는"]}, 年柱는 ${qmap["년주는"]} 年干은 ${qmap["년간은"]} 年支는 ${qmap["년지는"]} 이다. `;
  wonkook += ohangCountStr;
  return wonkook;
}

function transformYearFortune(fortuneStr: string): string {
  const lines = fortuneStr.trim().split("\n");
  let header = lines.shift() || "";
  lines.splice(1, 1);
  let wonkook = "";
  for (let i = 0; i < 6; i++) {
      wonkook += lines.shift() || "";
  }
  const w = wonkook.replace(/\|/g, "");
  wonkook = `${w[0]}${w[1]}${w[3]}${w[2]} ${w[6]}${w[7]}${w[4]}${w[5]}`;
  header = `${header.substring(0, header.length - 1)}, ${wonkook}]`;
  return `${header}\n${lines.join("\n")}\n`;
}

function buildPrompt(saju: string, systemPrompt: string): string {
  let birthdayStr = "";
  let birthdayOnlyStr = "";
  let sexStr = "";
  let ageStr = "";
  let todayFortune = "";
  let wonkookStr = "";

  saju = saju.replace(/\n\n/g, "\n");
  const splitStr = "### ";
  const sajuSections = saju.split(splitStr);

  let idx = findSection(sajuSections, "오늘의 운세");
  const todayFortuneSection = sajuSections[idx];
  todayFortune = todayFortuneSection.substring(todayFortuneSection.indexOf("\n") + 1);
  todayFortune = todayFortune.replace(/\n/g, " ");
  sajuSections.splice(idx, 1);

  idx = findSection(sajuSections, "올해의 운세");
  sajuSections[idx] = transformYearFortune(sajuSections[idx]);
  idx = findSection(sajuSections, "내년의 운세");
  sajuSections[idx] = transformYearFortune(sajuSections[idx]);
  idx = findSection(sajuSections, "흐름의 시기");
  sajuSections[idx] = transformYearFortune(sajuSections[idx]);

  idx = findSection(sajuSections, "성별");
  const sexSection = sajuSections[idx];

  const regex = /(\d+)년 (\d+)월 (\d+)일 \d+시 \d+분\[(\d+)세\]/;
  const match = regex.exec(saju);
  if (sexSection.includes("남자")) {
      sexStr = "남자";
  } else {
      sexStr = "여자";
  }
  if (match) {
      ageStr = match[4];
      birthdayStr = `생일은 ${match[1]}년 ${match[2]}월 ${match[3]}일 이고, 나이는 ${ageStr}세, 성별은 ${sexStr} 이다.`;
      birthdayOnlyStr = `${match[1]}년 ${match[2]}월 ${match[3]}일`;
  }
  wonkookStr = getWonkookTable(sajuSections);
  idx = findSection(sajuSections, "원국");
  sajuSections.splice(idx, 1);

  saju = sajuSections.join("\n# ");

  const d = new Date();
  const today = `오늘은 날짜는 ${d.getFullYear()} 년 ${d.getMonth() + 1} 월 ${d.getDate()} 일 이다.`;
  const systemMessageFromChatModel = systemPrompt;
  const newSystemMessage = `
${saju}
* ${birthdayStr}
* ${today}
* 오늘의 운세는 ${todayFortune}
* ${wonkookStr}
${systemMessageFromChatModel}
`;
  return newSystemMessage;
}

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
  const controller = new AbortController();
  let stream = null;

  if (systemPrompt.startsWith("abort")) {
    status.aborted = true; 
    stream!.cancel();
    controller.abort();
    console.log("aborted !!!!!!!!!!!!!!!!!!!!!!!!!=")
    return;
  } 

  let messagesToSend: Message[] = [];

  let systemMessage = "너는 사주명리에 통달한 인공지능 언어모델 SajuGPT이다. 모든 질문에 사주명리 전문가로서 성실히 답하라.";
  if (process.env.NEXT_PUBLIC_TITLE != "SajuGPT")
    // systemMessage = "너는 세상 모든 지식에 통달한 지식 전문가 ChangGPT이다. 모든 질문에 전문적이고 정확한 답변을 하세요.";
    systemMessage = "You are ChangGPT, the knowledgeable expert who knows everything about the world. Give professional and accurate answers to all questions. If you asked in Korean, answer in Korean.";
  if (process.env.NEXT_PUBLIC_TITLE == "SajuGPT" && saju.length > 0) {
    let prompt = buildPrompt(saju, "\n위 사주를 기반으로 아래 질문에 답하시오.");
    systemMessage = prompt;
  }

  messagesToSend = messages;
  let last = messagesToSend.length - 1;

  const res = await fetchOpenAI(systemMessage, messagesToSend, 700, key, uuid, true, controller.signal);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res!.status !== 200) {
    const result = await res!.json();
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
stream = new ReadableStream({
    cancel(reason) {
        console.log("canceled=" + reason);
        stopped = true;
        return;
      },
      async start(controller) {

        const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (status.aborted) {
          controller.close();
          console.log("stopped = status.aborted");
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
      for await (const chunk of res!.body as any) {
        i += 1;
        // if (i == 10) {
        //   console.log("test break");
        //   controller.close();
        //   break;
        // }
        if (stopped || status.aborted) {
          console.log("stopped or aborted =" + status.aborted)
          stopped = false;
          status.aborted = false;
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
