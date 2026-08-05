export interface CoTerm {
  term: string;
  /** 이 용어가 등장한 문서 수 */
  docs: number;
  /** docs / 전체 문서 수 */
  rate: number;
}

/**
 * 해외에는 검색광고(연관 검색어) 같은 소스가 없다.
 * 그래서 동반 키워드를 **처음부터 실제 텍스트 공출현**으로 뽑는다.
 * → "검색 동반 상승" 단계를 건너뛰고 곧바로 co-mention 기반이 된다.
 */
const STOPWORDS = new Set([
  // 관사·전치사·대명사
  "the", "and", "for", "with", "you", "your", "this", "that", "from", "are",
  "was", "were", "have", "has", "had", "not", "but", "all", "can", "will",
  "just", "out", "get", "got", "how", "why", "what", "when", "who", "our",
  "they", "them", "their", "she", "his", "her", "him", "its", "it's", "there",
  "here", "then", "than", "too", "very", "some", "any", "each", "more", "most",
  "into", "over", "after", "before", "about", "again", "one", "two", "new",
  "make", "made", "making", "like", "love", "best", "good", "great", "little",
  // 유튜브/SNS 상투어
  "subscribe", "channel", "video", "shorts", "youtubeshorts", "watch", "follow",
  "link", "bio", "comment", "share", "click", "check", "please", "thanks",
  "today", "instagram", "tiktok", "youtube", "reels", "reel", "post", "posted",
  "www", "com", "http", "https", "shop", "order", "story", "stories",
  "day", "week", "time",
  // 숏폼 배포용 태그 — 내용이 아니라 유통 채널을 가리킨다
  "short", "shortvideo", "shortsvideo", "shortsfeed", "shortsviral",
  "viralvideo", "viralshorts", "trendingshorts", "ytshorts", "ytshort",
  "fyp", "foryou", "foryoupage", "explore", "explorepage",
  // 설명란 상투어 (제목 색인이 대부분 걸러내지만 제목에 붙이는 채널도 있다)
  "tags", "keywords", "hashtag", "hashtags", "disclaimer", "copyright",
  "credits", "credit", "inquiries",
  // 축약형 잔여 토큰 (don't → dont 등)
  "dont", "doesnt", "didnt", "isnt", "wasnt", "arent", "wont", "cant",
  "couldnt", "shouldnt", "wouldnt", "youre", "youve", "thats", "ive", "its",
  "theyre", "youll", "weve", "itll", "well", "wed", "youd", "theyll", "hes",
  // 의미 없는 일반 동사·형용사
  "eat", "eating", "try", "trying", "amazing", "really", "also", "much",
  "many", "such", "been", "being", "does", "did", "want", "know", "see",
  // 장소·상태를 가리키는 일반 명사 — 식품이 아니라 배경어다 (예: "best spot in town")
  "spot", "spots", "place", "places", "vibe", "vibes", "area", "town", "city",
  "thing", "things", "way", "world", "life", "part", "kind", "type",
  // 일반 식욕·감상어 — 특정 제품이 아니라 "먹고 싶다/맛있다" 류 (예: "sweet craving")
  "craving", "cravings", "satisfying", "addictive", "favorite", "favourite",
  "relatable", "obsessed", "hungry",
  // 콘텐츠 필러 명사·전치사류 (해외 후보에 새어 나온 배경어)
  "inside", "evening", "lovers", "featuring", "choose", "until", "limited",
  "minute", "minutes", "edition", "years", "rainy", "monsoon",
  // ── 영어 일반 기능어 (뉴스 산문 추출용 대폭 보강) ──
  "whether", "which", "these", "those", "need", "needs", "well", "only", "first",
  "second", "third", "point", "days", "line", "home", "take", "takes", "other",
  "others", "still", "even", "back", "off", "while", "where", "would", "could",
  "should", "may", "might", "must", "three", "lot", "lots", "around", "through",
  "because", "between", "without", "within", "done", "going", "look", "looks",
  "feel", "think", "thought", "say", "says", "said", "tell", "ask", "use", "used",
  "using", "come", "comes", "give", "gives", "put", "keep", "let", "every", "own",
  "same", "another", "few", "little", "long", "high", "next", "last", "since",
  "yet", "already", "always", "never", "often", "sometimes", "maybe", "perhaps",
  "instead", "however", "though", "across", "along", "among", "against", "toward",
  "upon", "onto", "unto", "per", "via", "plus", "including", "includes", "include",
  // ── 음식 매체 상투어 (레시피·리뷰·가이드 boilerplate) ──
  "recipe", "recipes", "dish", "dishes", "meal", "meals", "best", "perfect",
  "easy", "quick", "simple", "taste", "tastes", "summer", "spring", "autumn",
  "winter", "week", "weekly", "weekend", "guide", "review", "reviews", "tips",
  "list", "ideas", "idea", "served", "serve", "serves", "serving", "style",
  "hot", "cold", "fresh", "healthy", "homemade", "inspired", "classic", "ultimate",
  "favourites", "favorites", "everything", "anything", "something", "someone",
  "everyone", "people", "expert", "experts", "chef", "chefs", "kitchen", "table",
  "meals", "brunch", "lunch", "dinner", "breakfast", "supper", "menu", "menus",
  // YouTube 자동생성 음악 설명 상투어 ("Provided to YouTube by … Auto-generated")
  "auto", "generated", "provided", "released", "music", "records", "record",
  "license", "licensed", "label", "composer", "lyricist", "℗",
  // 비식품 바이럴 — "viral/trending" 시드가 끌어오는 키즈·게임·챌린지 콘텐츠
  // (예: "The Floor is Lava Challenge") — 음식과 무관하므로 후보에서 제외
  "challenge", "floor", "playground", "obstacle", "escape", "parkour",
  "minecraft", "roblox", "fortnite", "gameplay", "gaming", "gamer",
  "prank", "unboxing", "squishy", "slime", "toys", "sniper",
  // ── 기사 본문 전체 크롤링 시 딸려오는 웹 페이지 크롬·약관·푸터 보일러플레이트 ──
  // (네비/쿠키배너/뉴스레터/저작권 고지 — 어느 사이트에나 있고 트렌드와 무관)
  "reserved", "rights", "privacy", "terms", "policy", "cookie", "cookies",
  "consent", "gdpr", "accept", "contact", "rss", "content", "newsletter",
  "newsletters", "sign", "signin", "signup", "login", "register", "account",
  "settings", "password", "email", "address", "submit", "search", "skip",
  "main", "menu", "close", "cover", "note", "adding", "range", "nearly",
  "regular", "fan", "earn", "advertisement", "advertising", "sponsored",
  "ads", "related", "latest", "popular", "read", "reading", "article",
  "articles", "news", "press", "page", "pages", "website", "site", "browser",
  "javascript", "enable", "update", "updated", "published", "author", "editor",
  "staff", "reporter", "image", "images", "getty", "caption", "download",
  "app", "apps", "mobile", "digital", "online", "tap", "load", "loading",
  "error", "sorry", "unavailable", "available", "feedback", "support", "help",
  "faq", "careers", "jobs", "advertise", "partner", "partners", "affiliate",
  "disclosure", "ethics", "guidelines", "standards", "corrections", "archive",
  "sitemap", "facebook", "twitter", "pinterest", "linkedin", "whatsapp",
  "snapchat", "reddit", "threads", "copied", "clipboard", "print", "save",
  "saved", "bookmark", "gift", "subscription", "subscriber", "subscribers",
  "trial", "offer", "unlimited", "access", "premium", "member", "members",
  "membership", "profile", "notifications", "language", "region", "edition",
  // 본문 산문에서 흔한 일반 동사·부사(재료명이 아니라 조리 서술어) — 재료·제품명은 남긴다
  "cook", "cooking", "cooked", "add", "adds", "added", "makes", "ready",
  "enough", "once", "having", "work", "works", "better", "tried", "whole",
  "now", "design", "media", "hand", "full", "open", "red", "green", "free",
  // 조리 과정·주방 기구·상태 서술어 — 식품맥락 문장에도 흔히 붙지만 트렌드명이 아니다
  // (poke/acai "bowl", chocolate "chip" 같은 제품형 명사는 일부러 제외)
  "second", "seconds", "minute", "melt", "melts", "melting", "melted",
  "mix", "mixing", "mixed", "freeze", "freezing", "frozen", "fill", "filled",
  "filling", "roll", "rolling", "rolled", "counter", "countertop", "board",
  "ceramic", "foil", "tiny", "firmly", "wet", "dusty", "dust", "liquid",
  "whisk", "whisking", "stir", "stirring", "knead", "kneading", "pour",
  "pouring", "drain", "drained", "coat", "coated", "grease", "greased",
  "preheat", "simmer", "boil", "boiling", "fold", "folding", "dice", "diced",
  "chop", "chopped", "spoon", "spatula", "oven", "microwave", "fridge",
  "freezer", "stove", "heat", "heated", "warm", "cool", "cooled", "room",
  "temperature", "degrees", "cup", "cups", "tablespoon", "teaspoon", "tbsp",
  "tsp", "ounce", "ounces", "gram", "grams", "pinch", "handful", "batch",
  // 본문에 자주 붙는 일반 형용사·수량 산문(맛·식감어 crunchy/creamy/rich는 일부러 남긴다)
  "both", "half", "extra", "ever", "found", "side", "sides", "large", "feels",
  "walls", "wire", "upper", "lower", "near", "nearby", "big", "small", "huge",
  "thin", "thick", "deep", "wide", "light", "heavy", "plenty", "bunch",
  "couple", "flimsy", "nicer", "nice", "bit", "bits", "piece", "pieces",
]);

/**
 * 중국어는 띄어쓰기가 없어 단어 토큰화가 불가능하다.
 * 한자 구간을 통째로 잘라 **2~3자 n-gram**을 만든다.
 * (급증 배수(lift)가 일반 표현을 알아서 억제하므로 불용어는 최소만 둔다)
 */
const ZH_STOPWORDS = new Set([
  "视频", "影片", "订阅", "訂閱", "频道", "頻道", "分享", "喜欢", "喜歡",
  "大家", "我们", "我們", "今天", "一个", "一個", "这个", "這個", "可以",
  "没有", "沒有", "什么", "什麼", "真的", "不是", "就是", "自己", "这样",
  "這樣", "点赞", "點讚", "关注", "關注", "评论", "評論",
]);

const CJK_RUN_RE = /[一-鿿]{2,}/g;
const HASHTAG_RE = /#([a-z0-9_]{3,32})/g;

/**
 * 한국어 조사·어미. 유튜브 제목은 "두바이초콜릿이", "편의점에서"처럼 명사에 조사가
 * 붙어 나온다. 띄어쓰기로만 쪼개면 같은 제품이 여러 토큰으로 흩어지므로 꼬리를 뗀다.
 * (형태소 분석기 없이 접미사 제거 — 이 프로젝트가 이유 태그에서 쓰는 방식과 동일)
 * ⚠️ 긴 것부터 시도. 어간이 2자 미만이면 떼지 않는다(짧은 단어 훼손 방지).
 */
const KO_PARTICLES = [
  "으로써", "으로서", "에서는", "에게서", "이라는", "라는",
  "으로", "에서", "에게", "이랑", "한테", "까지", "부터", "처럼", "보다",
  "라고", "이나", "마다", "조차", "마저", "밖에", "이란", "에는",
  "은", "는", "이", "가", "을", "를", "의", "와", "과", "도", "만", "로", "랑",
];

/** 한국어 상투어·클릭베이트·채널 boilerplate (콘텐츠 발굴 노이즈). */
const KO_STOPWORDS = new Set([
  // 유튜브 설명란 boilerplate ("이 영상은 소정의 수익이 발생할 수 있습니다")
  "소정", "소정의", "수익", "수익이", "발생", "발생할", "있습니다", "없습니다",
  "채널", "채널에", "구독", "좋아요", "알림", "설정", "영상", "영상은", "브금",
  "브금대통령", "track", "gmail", "협찬", "제공", "유료광고", "광고",
  // 클릭베이트·감탄·형용사
  "미쳤다", "대박", "진짜", "너무", "완전", "이렇게", "그리고", "오늘", "오늘도",
  "요즘", "이번", "역대급", "레전드", "귀여운", "맛있는", "맛있는거", "먹으면",
  "여름", "봄", "가을", "겨울", "주차", "올해", "작년", "내년", "이번주",
  "만들기", "만드는", "레시피", "리뷰", "후기", "추천", "브이로그", "먹방",
  "다는", "했다", "합니다", "입니다", "네요", "봤다", "봅니다",
  "먹어봤다", "먹어봄", "먹었다", "해봤다", "사봤다", "만들어봤다", "먹어보기",
  // ── 예측력 백테스트에서 실제로 후보 상위를 차지한 노이즈 ──
  // 42건 중 22건(52%)이 아래 유형이었고, 히트로 잡힌 4건도 전부 여기 속했다.
  // 일반어·기능어
  "이게", "나온", "나온다", "역시", "그냥", "정도", "생각", "가지", "종류",
  "꿀팁", "정보", "모음", "총정리", "비교", "실화", "논란", "근황",
  // 유통·판매 맥락어 (제품이 아니라 파는 곳·형태)
  "마트", "편의점", "행사", "할인", "출시", "신상", "신제품", "품절", "재입고",
  "홈카페", "다이어터", "다이어트", "혼밥", "간식", "디저트", "음료",
  // 수량·구성 표기
  "종류별", "세트", "묶음", "낱개", "대용량",
  // 지명 (제품이 아니라 장소 — "대전 맛집", "제주 카페" 등에서 새어 나옴)
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "제주",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남",
  "강남", "홍대", "명동", "성수", "이태원", "연남", "가로수길", "국내", "해외", "일본", "미국",
  // 대결·순위 포맷어 ("신상 대전", "라면 대전", "OO 순위")
  "대전", "대결", "월드컵", "순위", "랭킹", "top", "베스트", "best",
  // 비식품 교양·과학·시사 (예: "화학반응의 세계") — 음식과 무관한 콘텐츠 화제어
  "화학", "화학반응", "반응", "과학", "실험", "원리", "우주", "지구", "역사",
  "다큐", "정치", "경제", "시사", "세계",
  // 방송·편성·사업 콘텐츠 (예: "방송편성표", "카페창업")
  "방송", "방송편성표", "편성표", "tv", "티비", "채널편성",
  "창업", "카페창업", "프랜차이즈", "가맹", "가맹점", "매출", "폐업",
  // 기사·매체 산문 상투어 (기사 키워드 추출 노이즈)
  "조합", "트렌드", "웹사이트", "차세대", "게재", "일부", "요리법", "기사", "매체",
  // 한국 식품기사 상투어 — 신문 보도체·업계 일반어 (제품명이 아님)
  "밝혔다", "밝혀", "밝힌", "밝히", "전했다", "말했다", "설명했다", "덧붙였다",
  "위해", "위한", "통해", "통한", "지난", "오는", "대상", "함께", "관련", "진행",
  "예정", "계획", "대표", "회사", "업체", "기업", "소비자", "고객", "매장", "판매",
  "운영", "서비스", "이벤트", "증정", "한정", "제공", "시장", "브랜드", "제품",
  "특히", "또한", "이번", "올해", "지원", "확대", "강화", "개최", "참여", "모집",
  "선정", "공개", "선보", "선보인다", "선보였다", "출시했다", "관계자", "업계",
  "농림축산식품부", "식약처", "정부", "협회", "이날", "당사", "제조", "가공",
  "등을", "등의", "등에", "지난해", "올해도", "내년", "상반기", "하반기", "분기",
  // 동사 어간 잔여 ("멈출 수 없네"의 앞부분 등)
  "멈출", "멈춤", "멈춰", "멈추",
  // 일반 명사·형용사 잡음 (관찰된 후보: 정체·화제·상큼한·느끼하지·쟁여두고)
  "정체", "화제", "상큼", "상큼한", "느끼", "느끼한", "느끼하지", "쟁여", "쟁여두고",
  "반으", "정도", "세계관",
  // 퀴즈·맞히기·리액션형 콘텐츠 상투어 (예: "이 소리 맞혀보세요")
  "맞혀보세요", "맞혀봐", "맞혀", "맞춰보세요", "맞춰봐", "맞춰", "퀴즈", "정답", "리액션",
  // "~보세요/~해봐/~라면" 류 권유·조건 상투어, 포장 단위, 인물/채널명
  "보세요", "봐요", "해보세요", "먹어보세요", "좋아한다면", "좋아한다", "좋아하면",
  "봉지", "봉지욱", "스프링클러", "물뿌리개",
  // 일반 명사·부사·경험형 동사 잔여 (관찰된 후보: 사람·솔직·먹어본)
  "사람", "사람들", "사람인", "솔직", "솔직히", "솔직한우", "먹어본", "먹어보고",
  "본인", "여러분", "누구", "우리", "저희",
]);

/**
 * 브랜드·유통사·인물명. 트렌드 "제품"이 아니라 만든 곳/파는 곳/사람이라
 * ODM 스크리닝이나 신제품 기획으로 이어지지 않는다.
 * (백테스트에서 비비고·백종원·세븐일레븐·삼립이 후보 상위에 올랐다)
 */
const KO_BRAND_STOPWORDS = new Set([
  "비비고", "백종원", "삼립", "오리온", "롯데", "해태", "농심", "빙그레", "매일",
  "남양", "동원", "풀무원", "cj", "오뚜기", "샘표", "청정원", "종가집",
  "세븐일레븐", "gs25", "cu", "이마트", "홈플러스", "코스트코", "쿠팡", "마켓컬리",
  "스타벅스", "투썸", "이디야", "메가커피", "컴포즈", "빽다방", "파리바게뜨", "뚜레쥬르",
  "맥도날드", "버거킹", "롯데리아", "맘스터치", "노브랜드", "피코크",
  // 인물·아이돌명 (제품이 아니라 사람 — 예: "카리나 간식" 같은 콘텐츠 화제어)
  "카리나", "아이유", "뉴진스", "블랙핑크", "방탄", "bts", "아이브", "르세라핌",
]);

/**
 * 숫자로 시작하는 구성 표기("2종", "3구", "10입").
 * NUM_UNIT_RE 가 못 잡는 형태를 보완한다.
 */
const NUM_PACK_RE = /^\d+(종|구|입|팩|봉|병|캔|개입|인분)$/;

function stripKoreanParticle(token: string): string {
  if (!/[가-힣]$/.test(token)) return token;
  for (const p of KO_PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) {
      return token.slice(0, token.length - p.length);
    }
  }
  return token;
}

function tokenize(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    // 축약형은 아포스트로피를 지워 하나의 토큰으로 (don't → dont)
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** 한자 구간에서 2~3자 n-gram을 뽑는다. */
function cjkGrams(text: string): string[] {
  const out: string[] = [];
  for (const run of (text ?? "").match(CJK_RUN_RE) ?? []) {
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i + n <= run.length; i += 1) {
        const gram = run.slice(i, i + n);
        if (!ZH_STOPWORDS.has(gram)) out.push(gram);
      }
    }
  }
  return out;
}

/** 숫자+단위(날짜·가격·수량) — "7월", "900원", "2026년", "3주차" 등 발굴 노이즈. */
const NUM_UNIT_RE = /^\d+(원|월|일|년|주차|개월|주년|호|위|명|번|시|분|초|kg|g|ml|l|cm|편)$/i;

/**
 * 한국어 활용형 어미 — 동사·형용사·문장 조각을 부류로 걸러낸다.
 * 제품명은 명사라 이런 어미로 끝나지 않는다. (예: "멈출 수 없네", "좋아한다면", "맞혀보세요")
 * ⚠️ 식품명과 충돌하는 어미는 넣지 않는다: "면"(라면·냉면), "다"(단독) 등은 제외.
 * 그래서 요·세요·네요처럼 명확한 종결어미와 특정 활용형만 매칭한다.
 */
export const KO_VERB_ENDING =
  /(?:세요|해요|네요|어요|아요|에요|예요|봐요|봐|군요|는데|니까|잖아|거든|더라|던데|는다|한다|된다|왔다|갔다|봤다|했다|났다|겠다|드세요|보세요|다면|하지|않은|보자|하자|먹자|없네|있네|네|어본|아본|해본|여본|어봄|아봄)$/;

function isUseful(token: string, seedTokens: Set<string>): boolean {
  // 한글은 2자 이상이면 의미 단위(제품명 대부분 2~3자), 그 외는 3자 이상.
  const minLen = /[가-힣]/.test(token) ? 2 : 3;
  if (token.length < minLen) return false;
  if (/^\d+$/.test(token)) return false;
  if (NUM_UNIT_RE.test(token)) return false;
  if (NUM_PACK_RE.test(token)) return false;
  if (STOPWORDS.has(token)) return false;
  if (KO_STOPWORDS.has(token)) return false;
  if (KO_BRAND_STOPWORDS.has(token)) return false;
  // 3자 이상 한글이 활용형 어미로 끝나면 동사·문장 조각 → 제외 (라면 등 2자 식품명은 안전)
  if (/[가-힣]/.test(token) && token.length >= 3 && KO_VERB_ENDING.test(token)) return false;
  if (seedTokens.has(token)) return false;
  return true;
}

/**
 * 시드 자신을 후보에서 빼기 위한 토큰 집합.
 * 공백을 없앤 형태(`dubaichocolate`)도 넣어 `#dubaichocolate` 해시태그를 걸러낸다.
 */
export function seedTokenSet(seed: string): Set<string> {
  const set = new Set(tokenize(seed));
  for (const gram of cjkGrams(seed)) set.add(gram);
  const compact = (seed ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣一-鿿]/g, "");
  if (compact) set.add(compact);
  return set;
}

/**
 * 문서 하나에서 후보 용어 집합을 뽑는다 (중복 없음 = 문서 빈도 계산용).
 * 단어 · 2어절 · 한자 n-gram, 그리고 선택적으로 해시태그.
 *
 * 해시태그(`#dubaichocolate`)는 신조어 트렌드의 가장 강한 신호라 발굴에서만 켠다.
 * 분석 화면에선 `pistachio` / `#pistachio` 가 중복 노출되므로 끈다.
 */
export function docTerms(
  text: string,
  seedTokens: Set<string>,
  opts: { hashtags?: boolean } = {},
): Set<string> {
  const raw = text ?? "";
  const out = new Set<string>();

  if (opts.hashtags) {
    for (const m of raw.toLowerCase().matchAll(HASHTAG_RE)) {
      const tag = m[1].replace(/_/g, "");
      if (tag.length >= 3 && !STOPWORDS.has(tag) && !seedTokens.has(tag)) {
        out.add(`#${tag}`);
      }
    }
  }

  // 한글 조사를 떼어 같은 제품명이 흩어지지 않게 한 뒤 필터.
  const tokens = tokenize(raw)
    .map(stripKoreanParticle)
    .filter((t) => isUseful(t, seedTokens));
  for (const t of tokens) out.add(t);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  for (const gram of cjkGrams(raw)) {
    if (!seedTokens.has(gram)) out.add(gram);
  }

  return out;
}

/**
 * 문서 묶음에서 대상 키워드와 함께 등장하는 용어를 문서 빈도순으로 추출.
 * @param minDocs 이 건수 미만 등장하는 용어는 버린다 (노이즈 컷)
 */
export function extractCoTerms(
  docs: string[],
  seed: string,
  topN = 15,
  minDocs = 2,
): CoTerm[] {
  const seedTokens = seedTokenSet(seed);
  const df = new Map<string, number>();

  for (const doc of docs) {
    for (const term of docTerms(doc, seedTokens)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const total = docs.length || 1;
  return [...df.entries()]
    .filter(([, count]) => count >= minDocs)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([term, count]) => ({ term, docs: count, rate: count / total }));
}
