"use client";

import { useState } from "react";
import { useStore } from "@/lib/store-context";
import type { Keyword } from "@/lib/types";
import { formatCount, formatDateTime } from "@/lib/format";

type Msg = { kind: "ok" | "error"; text: string } | null;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function SocialPanels({ keyword }: { keyword: Keyword }) {
  const { refreshYouTube, refreshInstagram, refreshing } = useStore();
  const [ytMsg, setYtMsg] = useState<Msg>(null);
  const [igMsg, setIgMsg] = useState<Msg>(null);

  const yt = keyword.youtube;
  const ig = keyword.instagram;

  async function onYouTube() {
    setYtMsg(null);
    const r = await refreshYouTube(keyword.id);
    setYtMsg(
      r.error
        ? { kind: "error", text: r.error }
        : { kind: "ok", text: "YouTube 신호를 수집했습니다." },
    );
  }
  async function onInstagram() {
    setIgMsg(null);
    const r = await refreshInstagram(keyword.id);
    setIgMsg(
      r.error
        ? { kind: "error", text: r.error }
        : { kind: "ok", text: "Instagram 신호를 수집했습니다." },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* YouTube */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">
            ▶ YouTube 신호
            {yt && (
              <span className="ml-2 text-xs font-normal text-neutral-400">
                최근 {yt.windowDays}일 · {formatDateTime(yt.fetchedAt)}
              </span>
            )}
          </h2>
          <button
            onClick={onYouTube}
            disabled={refreshing}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {refreshing ? "수집 중…" : yt ? "다시 수집" : "수집"}
          </button>
        </div>

        {ytMsg && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              ytMsg.kind === "error"
                ? "bg-red-50 text-red-600"
                : "bg-accent-soft text-accent-ink"
            }`}
          >
            {ytMsg.text}
          </p>
        )}

        {yt ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="영상 수(추정)" value={formatCount(yt.videoCount)} />
              <Stat label="숏츠 수(추정)" value={formatCount(yt.shortCount)} />
              <Stat label="롱폼 수(추정)" value={formatCount(yt.longCount)} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="평균 조회수" value={formatCount(yt.avgViews)} />
              <Stat label="합계 조회수(샘플)" value={formatCount(yt.totalViews)} />
            </div>
            {yt.topVideo && (
              <a
                href={`https://www.youtube.com/watch?v=${yt.topVideo.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-xl border border-neutral-100 p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <p className="text-xs text-neutral-400">
                  최고 조회 영상 · {formatCount(yt.topVideo.views)}회
                  {yt.topVideo.isShort ? " · Shorts" : ""}
                </p>
                <p className="mt-0.5 line-clamp-2 font-medium text-accent-ink">
                  {yt.topVideo.title}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {yt.topVideo.channel}
                </p>
              </a>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-400">
            아직 수집 전입니다. “수집”을 눌러 최근 인기 영상 지표를 가져오세요.
          </p>
        )}
      </section>

      {/* Instagram */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">
            # Instagram 신호
            {ig && (
              <span className="ml-2 text-xs font-normal text-neutral-400">
                #{ig.hashtag} · {formatDateTime(ig.fetchedAt)}
              </span>
            )}
          </h2>
          <button
            onClick={onInstagram}
            disabled={refreshing}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {refreshing ? "수집 중…" : ig ? "다시 수집" : "수집"}
          </button>
        </div>

        {igMsg && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              igMsg.kind === "error"
                ? "bg-red-50 text-red-600"
                : "bg-accent-soft text-accent-ink"
            }`}
          >
            {igMsg.text}
          </p>
        )}

        {ig ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="인기 게시물(샘플)" value={`${ig.sampled}`} />
              <Stat label="릴스 수" value={`${ig.reelsCount} / ${ig.sampled}`} />
              <Stat label="평균 좋아요" value={formatCount(ig.avgLikes)} />
              <Stat label="합계 댓글" value={formatCount(ig.totalComments)} />
            </div>
            {ig.topMedia && ig.topMedia.permalink && (
              <a
                href={ig.topMedia.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-xl border border-neutral-100 p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <p className="text-xs text-neutral-400">
                  최고 좋아요 게시물 · {formatCount(ig.topMedia.likes)}
                  {ig.topMedia.isReel ? " · 릴스" : ""}
                </p>
                <p className="mt-0.5 line-clamp-2 font-medium text-accent-ink">
                  {ig.topMedia.caption || "(캡션 없음)"}
                </p>
              </a>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-400">
            아직 수집 전입니다. “수집”을 눌러 해시태그 인기 게시물을 가져오세요.
          </p>
        )}
      </section>
    </div>
  );
}
