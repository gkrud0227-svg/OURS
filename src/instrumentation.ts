/**
 * 서버 시작 시 **OS 신뢰 저장소의 루트 인증서**를 Node 기본 CA 집합에 얹는다.
 *
 * 사내망은 TLS 를 가로채 자체 루트("ePrism SSL", SOOSAN INT)로 재서명한다. 브라우저는
 * 그 루트를 Windows 인증서 저장소에서 신뢰하지만 Node 는 자체 번들만 보므로
 * SELF_SIGNED_CERT_IN_CHAIN 으로 실패한다. 실제로 이 때문에 네이버 자동완성 발굴이
 * 조용히 0건이 됐다(라우트가 개별 시드 실패를 빈 배열로 흡수해 에러도 안 보였다).
 *
 * ⚠️ 검증을 끄는 게 아니다(NODE_TLS_REJECT_UNAUTHORIZED=0 금지). 기본 CA에 **OS가 이미
 *    신뢰하는 루트를 더할 뿐**이라, 사내망 밖에서는 동작이 그대로다.
 */

/** Node 22.15+/24 의 CA 조회·교체 API. @types/node 20 에 아직 없어 구조적으로 좁혀 쓴다. */
interface CaCapableTls {
  getCACertificates?: (type: "default" | "system") => string[];
  setDefaultCACertificates?: (certs: string[]) => void;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const tls = (await import("node:tls")) as unknown as CaCapableTls;
  const get = tls.getCACertificates;
  const set = tls.setDefaultCACertificates;
  if (typeof get !== "function" || typeof set !== "function") return; // 구버전 Node — 그대로 둔다
  try {
    set([...new Set([...get("default"), ...get("system")])]);
  } catch {
    // 인증서 병합 실패는 치명적이지 않다 — 앱은 그대로 뜨고, 사내망에서만 외부 호출이 막힌다.
  }
}
