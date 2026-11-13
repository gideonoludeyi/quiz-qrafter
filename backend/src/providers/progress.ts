// Counts the question objects started so far in streamed quiz JSON. Only "prompt" keys
// match, because quotes inside string values arrive escaped (\"). Display only.
export function countQuestionsWritten(jsonSnapshot: string): number {
  return jsonSnapshot.match(/(?<!\\)"prompt"\s*:/g)?.length ?? 0;
}
