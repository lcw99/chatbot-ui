import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from '@/utils/app/const';
import { OpenAIError, OpenAIStream } from '@/utils/server';

import { ChatBody, Message } from '@/types/chat';

export const config = {
  runtime: 'edge',
};
import { AZURE_DEPLOYMENT_ID, OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION, OPENAI_MODEL } from '@/utils/app/const';

const handler = async (req: Request): Promise<Response> => {
  try {
    const { model, messages, key, prompt, temperature, uuidx, birtyday, saju } = (await req.json()) as ChatBody;

    let promptToSend = prompt;
    if (!promptToSend) {
      promptToSend = DEFAULT_SYSTEM_PROMPT;
    }

    let temperatureToUse = temperature;
    if (temperatureToUse == null) {
      temperatureToUse = DEFAULT_TEMPERATURE;
    }

    // const prompt_tokens = encoding.encode(promptToSend);

    // let tokenCount = prompt_tokens.length;
    // let messagesToSend: Message[] = [];

    // for (let i = messages.length - 1; i >= 0; i--) {
    //   const message = messages[i];
    //   const tokens = encoding.encode(message.content);
    //   const tokensLen = message.content.length / 2;
    //   console.log("message.content.length=" + message.content.length);

    //   if (tokenCount + tokensLen + 700 > model.tokenLimit) {
    //     console.log("tokenCount=" + tokenCount);
    //     console.log("tokensLen=" + tokensLen);
    //     break;
    //   }
    //   tokenCount += tokensLen;
    //   messagesToSend = [message, ...messagesToSend];
    // }

    // encoding.free();

    let messagesToSend = messages;
    const stream = await OpenAIStream(model, promptToSend, temperatureToUse, key, messagesToSend, uuidx, birtyday, saju);
    return new Response(stream);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      return new Response('Error', { status: 500, statusText: error.message });
    } else {
      return new Response('Error', { status: 500 });
    }
  }
};

export default handler;

export const fetchOpenAI = async (
  systemMessage: string,
  messagesToSend: Message[],
  maxNewToken: number,
  key: string,
  user: string,
  stream: boolean = true,
) => {
  let url = `${OPENAI_API_HOST}/v1/chat/completions`;
  if (OPENAI_API_TYPE === 'azure') {
    url = `${OPENAI_API_HOST}/openai/deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`;
  }

  console.log("url=" + url);
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
      ...(OPENAI_API_TYPE === 'openai' && {model: OPENAI_MODEL}),
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
        // temperature: 0.4,
        // top_p: 0.5,
        stop: ["\nA:", "\nB:"],
        stream: stream,
        user: user,
      }),
    }),
  });
  return res;
}