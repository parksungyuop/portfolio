// 계획서의 "운영 상수". 0단계 실측 후 값만 바꾼다.
export const AGE_MIN = 18;
export const POST_FEE = 5000; // 비구독 건당 게재비
export const SUBSCRIPTION_FEE = 39000;
export const LATE_CANCEL_HOURS = 6;
export const NO_SHOW_REPORT_AFTER_MIN = 30;
export const NO_SHOW_DEFENSE_HOURS = 24;
export const URGENT_WITHIN_HOURS = 24;
export const REVIEW_MIN_COUNT = 3; // 가게 별점은 이 개수 이상일 때만 노출
export const PREF_FIELDS = true; // 성별·나이대 필드 기능 플래그 (11장)

export const REGIONS = ["강남", "홍대", "건대", "신촌", "잠실", "서초"];
export const GAMES = ["NLH", "PLO", "토너먼트"];
export const AGE_BANDS = ["20대", "30대", "40대+"];

export const DEALER_REVIEW_ITEMS = [
  ["pay", "시급 지급"],
  ["mood", "분위기"],
  ["guests", "손님 매너"],
  ["rest", "휴식"],
  ["again", "재방문 의사"],
] as const;
export const DEALER_REVIEW_TAGS = ["시급 제때", "야식 좋음", "사장님 친절", "휴식 부족", "손님 거칠음"];

export const STORE_REVIEW_ITEMS = [
  ["skill", "실력"],
  ["attitude", "태도"],
  ["time", "시간 준수"],
  ["rehire", "재고용 의사"],
] as const;
export const STORE_REVIEW_TAGS = ["딜링 정확", "손님 응대 좋음", "시간 정확", "복장 단정", "실수 잦음"];

export const STORE_SANCTION_STEPS: [number, number | null][] = [
  [3, 7],
  [6, 30],
  [10, 90],
  [12, null], // 영구
];
