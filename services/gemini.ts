
import { GoogleGenAI, Modality, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;

export const generateScripts = async (
  slides: { index: number; image: string; text: string }[],
  totalDurationSec: number,
  style: string,
  language: 'en' | 'ko'
): Promise<{ slideIndex: number; script: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  // Standard speaking rate is approx 2.5 words per second (150 wpm)
  const totalWords = Math.floor(totalDurationSec * 2.5);
  const wordsPerSlide = Math.floor(totalWords / slides.length);

  const langInstruction = language === 'ko' 
    ? "Generate the script in Korean (한국어)." 
    : "Generate the script in English.";

  const prompt = `
    You are a professional presentation narrator. 
    Analyze the following slides and their text.
    Generate a cohesive narration script for a video that is exactly ${totalDurationSec} seconds long.
    
    TONE: ${style}
    LANGUAGE: ${langInstruction}
    TARGET WORD COUNT: Approximately ${totalWords} words in total (${wordsPerSlide} words per slide).
    
    Format the output as a JSON array of objects:
    - slide_index: Number (starting from 0).
    - script: The narration text.

    CRITICAL INSTRUCTIONS:
    1. The script for each slide must be long enough to be spoken naturally within the allocated time.
    2. If the tone is "An atmospheric tone that reveals the truth", use slow pacing, evocative imagery, and a sense of profound discovery.
    3. Ensure the flow between slides is seamless.
    4. Total speaking time must match the target duration as closely as possible.
  `;

  const contents = slides.map(s => ([
    { inlineData: { mimeType: "image/png", data: s.image.split(',')[1] } },
    { text: `Slide ${s.index} text: ${s.text}` }
  ])).flat();

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ parts: [{ text: prompt }, ...contents] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            slide_index: { type: Type.INTEGER },
            script: { type: Type.STRING }
          },
          required: ["slide_index", "script"]
        }
      }
    }
  });

  try {
    const text = response.text || "[]";
    return JSON.parse(text).map((item: any) => ({
      slideIndex: item.slide_index,
      script: item.script
    }));
  } catch (e) {
    console.error("Failed to parse script JSON", e);
    return [];
  }
};

export const generateAudio = async (text: string, voice: string = 'Kore'): Promise<Uint8Array> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  return decode(base64Audio);
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
