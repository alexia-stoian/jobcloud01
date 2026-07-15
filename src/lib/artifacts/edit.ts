/**
 * Artifact Editing
 * 
 * Handles basic edit operations on saved artifacts:
 * - Make shorter/longer
 * - Change tone (formal/casual)
 * - Add/remove sections
 * - Uses Claude for surgical edits
 * - Saves edits as new versions
 */

import { env } from "@/lib/env";
import * as artifactDAL from '@/lib/artifacts/dal';

export interface EditIntent {
  detected: boolean;
  operation?: 'shorten' | 'expand' | 'rewrite_tone' | 'add_section' | 'remove_section';
  context?: string;
}

/**
 * Detect if user wants to edit a previous artifact
 * Returns edit operation type if detected
 */
export function detectEditIntent(message: string): EditIntent {
  const lowerMsg = message.toLowerCase();
  
  // Detect shorten operations
  if (
    lowerMsg.includes('shorten') ||
    lowerMsg.includes('make it shorter') ||
    lowerMsg.includes('too long') ||
    lowerMsg.includes('condense') ||
    lowerMsg.includes('shorter version') ||
    lowerMsg.includes('cut down')
  ) {
    return {
      detected: true,
      operation: 'shorten',
      context: message
    };
  }
  
  // Detect expand operations
  if (
    lowerMsg.includes('expand') ||
    lowerMsg.includes('make it longer') ||
    lowerMsg.includes('more detail') ||
    lowerMsg.includes('add more') ||
    lowerMsg.includes('elaborate') ||
    lowerMsg.includes('go into more depth')
  ) {
    return {
      detected: true,
      operation: 'expand',
      context: message
    };
  }
  
  // Detect tone changes
  if (
    (lowerMsg.includes('more formal') || lowerMsg.includes('formal tone')) ||
    (lowerMsg.includes('more casual') || lowerMsg.includes('casual tone')) ||
    (lowerMsg.includes('more enthusiastic')) ||
    (lowerMsg.includes('tone') && (lowerMsg.includes('change') || lowerMsg.includes('adjust')))
  ) {
    return {
      detected: true,
      operation: 'rewrite_tone',
      context: message
    };
  }
  
  // Detect section add/remove
  if (
    lowerMsg.includes('add') && (lowerMsg.includes('section') || lowerMsg.includes('paragraph')) ||
    lowerMsg.includes('remove') && (lowerMsg.includes('section') || lowerMsg.includes('paragraph')) ||
    lowerMsg.includes('add information about') ||
    lowerMsg.includes('remove the part about')
  ) {
    return {
      detected: true,
      operation: lowerMsg.includes('remove') ? 'remove_section' : 'add_section',
      context: message
    };
  }
  
  // Generic edit request
  if (
    lowerMsg.includes('edit') ||
    lowerMsg.includes('modify') ||
    lowerMsg.includes('change') ||
    lowerMsg.includes('redo')
  ) {
    return {
      detected: true,
      operation: 'rewrite_tone',
      context: message
    };
  }
  
  return { detected: false };
}

/**
 * Apply edit to artifact content using Claude
 */
export async function applyEdit(
  originalContent: string,
  editIntent: EditIntent,
  anthropicApiKey: string,
  anthropicModel: string
): Promise<string> {
  if (!editIntent.operation) {
    throw new Error("Invalid edit operation");
  }

  let editPrompt = '';

  switch (editIntent.operation) {
    case 'shorten':
      editPrompt = `Make this SHORTER and more concise while keeping the key points. Remove redundancy and keep it punchy:

${originalContent}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'expand':
      editPrompt = `Expand this with more detail, specific examples, and depth while maintaining professionalism:

${originalContent}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'rewrite_tone':
      const toneMatch = editIntent.context?.match(/(formal|casual|enthusiastic|professional)/i);
      const targetTone = toneMatch?.[1] || 'professional';
      editPrompt = `Rewrite this with a ${targetTone} tone and style:

${originalContent}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'add_section':
      editPrompt = `Add more relevant information to this. Expand with additional details, achievements, or context that strengthens it:

${originalContent}

Request: ${editIntent.context}

Provide ONLY the edited version, no explanations.`;
      break;

    case 'remove_section':
      editPrompt = `Remove or trim unnecessary parts of this while keeping the core message:

${originalContent}

Request: ${editIntent.context}

Provide ONLY the edited version, no explanations.`;
      break;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: editPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const editedContent = data.content?.[0]?.text?.trim();

    if (!editedContent) {
      throw new Error("Empty response from edit operation");
    }

    return editedContent;
  } catch (error) {
    console.error("Error applying edit:", error);
    throw error;
  }
}

/**
 * Store edited artifact as new version
 */
export async function storeEditedVersion(
  userId: string,
  parentArtifactId: string,
  editedContent: string,
  operation: string
): Promise<string> {
  try {
    const newVersion = await artifactDAL.createVersion(
      parentArtifactId,
      editedContent
    );

    console.log(`[Edit] Stored ${operation} version for artifact ${parentArtifactId}, new ID: ${newVersion.id}`);
    return newVersion.id;
  } catch (error) {
    console.error("Error storing edited version:", error);
    throw error;
  }
}
