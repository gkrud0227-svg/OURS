import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSupabaseAdmin } from "./supabase";
import { neutralWeights, type SignalWeights } from "./signal-weights";

/**
 * 학습된 신호 가중치 저장소 — Supabase(signal_weights 단일 행) 또는 로컬 파일.
 * 가중치는 재계산 가능한 파생값이라 한 곳만 유지(id='current').
 */

const TABLE = "signal_weights";
const ROW_ID = "current";

function filePath(): string {
  const candidates = [
    join(process.cwd(), "data", "signal-weights.json"),
    join(process.cwd(), "trend-dashboard", "data", "signal-weights.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* 다음 후보 */
    }
  }
  return candidates[0];
}

export async function readWeights(): Promise<SignalWeights> {
  const sb = getSupabaseAdmin();
  if (sb) {
    // 가중치는 부가 기능이라 읽기 실패(테이블 미생성 등)는 던지지 않고 **중립**으로 폴백한다.
    // → 발굴 점수 적용이 어떤 경우에도 안 깨진다(중립 = 무영향).
    const { data, error } = await sb.from(TABLE).select("data").eq("id", ROW_ID).maybeSingle();
    if (error) return neutralWeights();
    return (data?.data as SignalWeights | undefined) ?? neutralWeights();
  }
  try {
    return JSON.parse(readFileSync(filePath(), "utf8")) as SignalWeights;
  } catch {
    return neutralWeights();
  }
}

export async function writeWeights(w: SignalWeights): Promise<void> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb
      .from(TABLE)
      .upsert({ id: ROW_ID, data: w, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase 가중치 저장 실패: ${error.message}`);
    return;
  }
  const p = filePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(w, null, 2));
}
