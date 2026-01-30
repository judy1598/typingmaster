import { useState, useRef, useEffect } from 'react';
import { practiceData } from '../data/practiceData';

type Language = 'korean' | 'english';

const MINIGAME_SECONDS = 30;
const COUNTDOWN_SECONDS = 3;
const MINIGAME_LEADERBOARD_KEY = 'typingMinigameLeaderboard';
const MINIGAME_LEADERBOARD_MAX = 100;

interface MinigameLeaderboardEntry {
  id: string;
  wpm: number;
  accuracy: number;
  wordCount: number;
  date: string;
  language: Language;
}

interface TypingMinigameProps {
  language: Language;
  onClose: () => void;
}

export default function TypingMinigame({ language, onClose }: TypingMinigameProps) {
  const words = practiceData[language].word;
  const [countdown, setCountdown] = useState<number | null>(null); // 3, 2, 1 준비 시간
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MINIGAME_SECONDS);
  const [targetWord, setTargetWord] = useState('');
  const [userInput, setUserInput] = useState('');
  const [correctChars, setCorrectChars] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [minigameLeaderboard, setMinigameLeaderboard] = useState<MinigameLeaderboardEntry[]>(() => {
    const saved = localStorage.getItem(MINIGAME_LEADERBOARD_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const savedThisGameRef = useRef(false);
  const startTimeRef = useRef<number | null>(null); // 첫 입력 시각 (다른 모드와 동일하게 활성 타이핑 시간 기준)
  const gameEndTimeRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickRandomWord = () => words[Math.floor(Math.random() * words.length)];

  const startMinigame = () => {
    savedThisGameRef.current = false;
    setStarted(true);
    setTimeLeft(MINIGAME_SECONDS);
    setTargetWord(pickRandomWord());
    setUserInput('');
    setCorrectChars(0);
    setTotalChars(0);
    setWordCount(0);
    setShowResult(false);
    startTimeRef.current = null;
    gameEndTimeRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const beginCountdown = () => {
    setCountdown(COUNTDOWN_SECONDS);
  };

  // 3, 2, 1 준비 카운트다운
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(null);
        startMinigame();
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // 30초 게임 타이머
  useEffect(() => {
    if (!started || showResult) return;
    const endAt = (startTimeRef.current ?? Date.now()) + MINIGAME_SECONDS * 1000;
    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((endAt - now) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        gameEndTimeRef.current = now;
        setShowResult(true);
        return;
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [started, showResult]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!started || showResult) return;
    const value = e.target.value;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();
    setUserInput(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!started || showResult) return;
    if (e.key !== ' ') return;
    e.preventDefault();
    const typed = e.currentTarget.value.trim();
    if (typed !== targetWord) return;
    setCorrectChars((c) => c + targetWord.length);
    setTotalChars((t) => t + targetWord.length);
    setWordCount((w) => w + 1);
    setTargetWord(pickRandomWord());
    setUserInput('');
  };

  // 낱말이 바뀔 때마다 입력값 강제 초기화 + 입력칸에 포커스 (다음 낱말에서 바로 타자 가능)
  useEffect(() => {
    if (started && !showResult) {
      setUserInput('');
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [targetWord, started, showResult]);

  // 다른 모드와 동일: 활성 타이핑 시간(첫 입력~게임 종료) 기준, 한글=글자수/영어=글자수÷5, 밀리초 정밀
  const elapsedMs =
    startTimeRef.current && gameEndTimeRef.current
      ? gameEndTimeRef.current - startTimeRef.current
      : MINIGAME_SECONDS * 1000;
  const elapsedMinutes = elapsedMs / 60_000;
  const wordsTyped = language === 'korean' ? correctChars : correctChars / 5;
  const rawWpm = elapsedMinutes > 0 ? wordsTyped / elapsedMinutes : 0;
  const wpm = Math.round(rawWpm * 10) / 10;
  const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 1000) / 10 : 100;

  // 결과가 나왔을 때 미니게임 리더보드에 한 번만 저장
  useEffect(() => {
    if (!showResult || savedThisGameRef.current) return;
    savedThisGameRef.current = true;
    const entry: MinigameLeaderboardEntry = {
      id: Date.now().toString(),
      wpm,
      accuracy,
      wordCount,
      date: new Date().toISOString(),
      language,
    };
    const updated = [entry, ...minigameLeaderboard].slice(0, MINIGAME_LEADERBOARD_MAX);
    setMinigameLeaderboard(updated);
    localStorage.setItem(MINIGAME_LEADERBOARD_KEY, JSON.stringify(updated));
  }, [showResult]);

  const sortedLeaderboard = [...minigameLeaderboard].sort((a, b) => b.wpm - a.wpm);
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">
          ⏱️ 30초 타자 대결
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLeaderboardModal(true)}
            className="px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-400/50 hover:bg-yellow-500/30 transition-all font-semibold"
          >
            🏆 리더보드
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-700/80 text-gray-300 border border-gray-500 hover:bg-gray-600 transition-all"
          >
            ← 메인으로
          </button>
        </div>
      </div>

      {countdown !== null ? (
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border-2 border-cyan-400/50 p-16 text-center">
          <p className="text-6xl font-mono font-bold text-cyan-400 tabular-nums drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse">
            {countdown}
          </p>
          <p className="text-xl text-cyan-300/80 mt-4">준비...</p>
        </div>
      ) : !started ? (
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border-2 border-purple-500/30 p-10 text-center">
          <p className="text-xl text-purple-200 mb-2">
            30초 동안 최대한 많은 낱말을 입력하세요!
          </p>
          <p className="text-cyan-300/80 text-sm mb-6">
            낱말을 입력한 뒤 <kbd className="px-1.5 py-0.5 rounded bg-gray-600 text-cyan-200 font-mono">스페이스</kbd>를 누르면 다음 낱말로 넘어갑니다.
          </p>
          <button
            onClick={beginCountdown}
            className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-lg rounded-xl hover:scale-105 transition-all shadow-[0_0_25px_rgba(139,92,246,0.5)]"
          >
            🚀 시작하기
          </button>
        </div>
      ) : showResult ? (
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border-2 border-cyan-400/50 p-10 text-center">
          <p className="text-4xl font-bold text-cyan-300 mb-6 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
            🏁 결과
          </p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800/60 rounded-xl p-4 border border-cyan-500/30">
              <p className="text-cyan-300 text-sm">타자 속도</p>
              <p className="text-3xl font-bold text-cyan-400">{wpm} WPM</p>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 border border-green-500/30">
              <p className="text-green-300 text-sm">정확도</p>
              <p className="text-3xl font-bold text-green-400">{accuracy}%</p>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 border border-purple-500/30 col-span-2">
              <p className="text-purple-300 text-sm">완료한 낱말 수</p>
              <p className="text-3xl font-bold text-purple-400">{wordCount}</p>
            </div>
          </div>
          <div className="flex justify-center gap-3 flex-wrap">
            <button
              onClick={() => setShowLeaderboardModal(true)}
              className="px-6 py-3 bg-yellow-500/20 text-yellow-300 border-2 border-yellow-400/50 rounded-xl font-bold hover:bg-yellow-500/30 transition-all"
            >
              🏆 리더보드
            </button>
            <button
              onClick={beginCountdown}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold rounded-xl hover:scale-105 transition-all"
            >
              🔄 다시 하기
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-600 text-white font-bold rounded-xl hover:bg-gray-500 transition-all"
            >
              메인으로
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border-2 border-purple-500/30 p-8">
          <div className="flex justify-between items-center mb-6">
            <span className="text-2xl font-mono font-bold text-yellow-400 tabular-nums">
              ⏱️ {timeLeft}초
            </span>
            <span className="text-cyan-300 font-semibold">
              완료: {wordCount}
            </span>
          </div>
          <p className="text-3xl font-bold text-center text-cyan-200 mb-6 break-all min-h-[3rem]">
            {targetWord}
          </p>
          <input
            key={targetWord}
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            className="w-full px-6 py-4 text-xl font-mono border-2 border-purple-500/50 rounded-xl bg-gray-950/80 text-white placeholder-purple-400/50 focus:border-cyan-400 focus:outline-none focus:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
            placeholder="여기에 입력..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
          />
          <p className="text-cyan-300/70 text-sm mt-2 text-center">
            맞추면 <kbd className="px-1 py-0.5 rounded bg-gray-700 text-cyan-200 font-mono text-xs">스페이스</kbd>로 다음 낱말
          </p>
        </div>
      )}

      {/* 미니게임 리더보드 모달 */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900/98 to-purple-900/98 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-hidden border-4 border-yellow-400/60 shadow-[0_0_50px_rgba(251,191,36,0.4)]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-yellow-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                🏆 30초 타자 대결 리더보드
              </h3>
              <button
                onClick={() => setShowLeaderboardModal(false)}
                className="text-gray-400 hover:text-white text-2xl transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              {sortedLeaderboard.length === 0 ? (
                <p className="text-center text-cyan-300/80 py-8">아직 기록이 없습니다. 게임을 플레이해보세요!</p>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-gray-900/95 z-10">
                    <tr className="text-yellow-300 border-b-2 border-yellow-500/50">
                      <th className="py-2 px-2">순위</th>
                      <th className="py-2 px-2">타자속도</th>
                      <th className="py-2 px-2">정확도</th>
                      <th className="py-2 px-2">낱말 수</th>
                      <th className="py-2 px-2">언어</th>
                      <th className="py-2 px-2">날짜</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaderboard.map((entry, index) => (
                      <tr
                        key={entry.id}
                        className="border-b border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                      >
                        <td className="py-2 px-2 font-bold text-cyan-300">{index + 1}</td>
                        <td className="py-2 px-2 text-yellow-400 font-semibold">{entry.wpm} WPM</td>
                        <td className="py-2 px-2 text-green-400">{entry.accuracy}%</td>
                        <td className="py-2 px-2 text-purple-300">{entry.wordCount}개</td>
                        <td className="py-2 px-2 text-cyan-300">{entry.language === 'korean' ? '한글' : '영어'}</td>
                        <td className="py-2 px-2 text-gray-400 text-sm">{formatDate(entry.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-yellow-300/70 text-sm mt-3 text-center">최대 {MINIGAME_LEADERBOARD_MAX}개 기록 · 타자속도 순</p>
          </div>
        </div>
      )}
    </div>
  );
}
