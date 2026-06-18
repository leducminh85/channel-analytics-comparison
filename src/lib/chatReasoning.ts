export function stripModelReasoning(text: string) {
  const promptLeakPattern =
    /(?:^|\n)(?:Ban la tro ly ao phan tich|Quy tac bat buoc:|Vai tro:|Quy uoc quan trong:|CURRENT_USER_QUESTION:|QUESTION_ANALYSIS:|QUESTION_RELEVANT_FACTS:|MANDATORY_FACT_LINES:|DATA_PACKET:)[\s\S]*$/i;
  const dataPacketLeakPattern =
    /(?:^|\n)ALLOWED_CHANNELS:[\s\S]*(?:\nGROUP_TOTALS:|\nCHANNEL_METRICS:|\nMONTHLY_HISTORY_LAST_12:|\nRECENT_DAILY_LAST_7:)[\s\S]*$/i;

  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(promptLeakPattern, "")
    .replace(dataPacketLeakPattern, "")
    .replace(/^(?:Cau hoi hien tai|Câu hỏi hiện tại|Cau hoi cua ban|Câu hỏi của bạn)\s*:?[^\n]*\n+/i, "")
    .trim();
}
