
import { GoogleGenAI } from "@google/genai";
import { Material, Transaction } from "../types";

/**
 * Genera un icono de aplicación profesional y dinámico usando Gemini 2.5 Flash Image.
 */
export const generateAppIconAI = async () => {
  // Initialize AI client with the mandatory named parameter.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Create a professional app icon for "Control de inventario", an advanced management system. 
    The icon should represent: industrial logistics, precise stock monitoring, and secure enterprise data.
    Visual style: Modern 3D isometric render, high-quality, minimalist, sleek lines. 
    Color palette: Deep sapphire blue, vibrant electric blue, and crisp minimalist white. 
    Isolated on a clean white background. No text inside the icon. 
    Premium enterprise software aesthetic.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  // Iterate through parts to find the inline image data as per guidelines.
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No se pudo generar el icono corporativo");
};
