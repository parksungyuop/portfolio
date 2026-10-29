"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell flex flex-col items-center justify-center gap-4 text-center">
      <div className="big" style={{ fontSize: 20 }}>진행할 수 없어요</div>
      <p className="text-muted">{error.message}</p>
      <div className="flex gap-2">
        <button className="btn btn-ghost" onClick={() => history.back()}>뒤로</button>
        <button className="btn btn-pri" onClick={reset}>다시 시도</button>
      </div>
    </div>
  );
}
