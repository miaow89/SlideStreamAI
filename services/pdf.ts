
import { SlideData } from '../types';

declare const pdfjsLib: any;

export const processPdf = async (file: File): Promise<SlideData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  // PDF.js worker source setup is handled via CDN in index.html, 
  // but we ensure the document is loaded correctly.
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const slides: SlideData[] = [];

  // High scale (4.0) ensures that even on 4K exports, the source text and images remain sharp.
  // Standard PDF point is 1/72 inch, so scale 4.0 is roughly 288 DPI.
  const RENDER_SCALE = 4.0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not create canvas context for PDF rendering");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Use high-quality transform for rendering
    await page.render({ 
      canvasContext: context, 
      viewport,
      intent: 'print' // Use print intent for better color/detail accuracy
    }).promise;
    
    // Use PNG (lossless) to preserve quality during the intermediate step
    const image = canvas.toDataURL('image/png');
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ');

    slides.push({
      index: i - 1,
      image,
      text
    });
  }

  return slides;
};
