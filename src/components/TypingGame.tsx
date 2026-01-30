import { useState, useRef, useEffect } from 'react';
import { practiceData, type PracticeType } from '../data/practiceData';
import TypingMinigame from './TypingMinigame';

type Language = 'korean' | 'english';

interface GameStats {
  wpm: number;
  accuracy: number;
  errors: number;
  correctChars: number;
  totalChars: number;
  elapsedSeconds: number;
}

interface SentenceFolder {
  id: string;
  name: string;
  sentences: string[];
}

interface LeaderboardEntry {
  id: string;
  wpm: number;
  elapsedSeconds: number;
  sentenceCount: number;
  date: string; // ISO string
  mode: 'normal' | 'custom';
  language?: 'korean' | 'english'; // 일반 모드일 때만
  folderName?: string;
}

const STORAGE_KEYS = { language: 'typingLanguage', practiceType: 'typingPracticeType', useCustomMode: 'typingUseCustomMode' } as const;

function reloadWithMode(lang?: Language, practice?: PracticeType, custom?: boolean) {
  if (lang !== undefined) localStorage.setItem(STORAGE_KEYS.language, lang);
  if (practice !== undefined) localStorage.setItem(STORAGE_KEYS.practiceType, practice);
  if (custom !== undefined) localStorage.setItem(STORAGE_KEYS.useCustomMode, String(custom));
  window.location.reload();
}

export default function TypingGame() {
  const [language, setLanguage] = useState<Language>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.language);
    return (s === 'korean' || s === 'english') ? s : 'korean';
  });
  const [practiceType, setPracticeType] = useState<PracticeType>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.practiceType);
    return (s === 'position' || s === 'word' || s === 'short' || s === 'long') ? s : 'short';
  });
  const [targetText, setTargetText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [stats, setStats] = useState<GameStats>({
    wpm: 0,
    accuracy: 0,
    errors: 0,
    correctChars: 0,
    totalChars: 0,
    elapsedSeconds: 0,
  });
  const [completedCount, setCompletedCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [allStats, setAllStats] = useState<GameStats[]>([]);
  const [recentTexts, setRecentTexts] = useState<string[]>([]); // 최근 10개 문장 추적
  const [folders, setFolders] = useState<SentenceFolder[]>(() => {
    // 로컬 스토리지에서 불러오기
    const saved = localStorage.getItem('sentenceFolders');
    if (saved) {
      return JSON.parse(saved);
    }
    // 기존 customTexts가 있으면 마이그레이션
    const oldCustomTexts = localStorage.getItem('customTexts');
    if (oldCustomTexts) {
      const texts = JSON.parse(oldCustomTexts);
      if (texts.length > 0) {
        return [{
          id: 'default',
          name: '기본 폴더',
          sentences: texts
        }];
      }
    }
    return [];
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedFolderId');
    return saved || null;
  });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [newCustomText, setNewCustomText] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [useCustomMode, setUseCustomMode] = useState(() => localStorage.getItem(STORAGE_KEYS.useCustomMode) === 'true');
  const [customTextIndex, setCustomTextIndex] = useState(0); // 커스텀 문장 순서 추적
  const [totalStartTime, setTotalStartTime] = useState<number | null>(null); // 커스텀 모드 전체 시작 시간
  const [totalCorrectChars, setTotalCorrectChars] = useState(0); // 커스텀 모드 누적 정답 글자 수
  const [totalActiveSeconds, setTotalActiveSeconds] = useState(0); // 커스텀 모드: 실제 타이핑한 시간만 누적 (문장 사이 멈춤)
  const [targetWpm, setTargetWpm] = useState<number>(() => {
    // 로컬 스토리지에서 불러오기
    const saved = localStorage.getItem('targetWpm');
    return saved ? parseInt(saved) : 100;
  });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('typingLeaderboard');
    return saved ? JSON.parse(saved) : [];
  });
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [leaderboardModeFilter, setLeaderboardModeFilter] = useState<'all' | 'korean' | 'english' | 'custom'>('all');
  const [showTargetAchievedModal, setShowTargetAchievedModal] = useState(false);
  const [achievedWpm, setAchievedWpm] = useState(0);
  const [showMinigame, setShowMinigame] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const getRandomText = (lang: Language, excludeTexts: string[] = []) => {
    // 커스텀 모드면 순서대로 반환
    if (useCustomMode) {
      const selectedFolder = folders.find(f => f.id === selectedFolderId);
      if (!selectedFolder || selectedFolder.sentences.length === 0) {
        return '폴더를 선택하고 문장을 추가해주세요!';
      }
      // 순서대로 반환 (인덱스는 startGame에서 증가)
      return selectedFolder.sentences[customTextIndex % selectedFolder.sentences.length];
    }
    
    // 일반 모드: 선택된 연습 유형(자리/낱말/짧은문장/긴문장)에서 랜덤 선택
    const texts = practiceData[lang][practiceType];
    if (!texts.length) return lang === 'korean' ? '연습 문장을 선택해주세요.' : 'Please select practice.';

    if (texts.length <= excludeTexts.length) {
      return texts[Math.floor(Math.random() * texts.length)];
    }
    let newText = texts[Math.floor(Math.random() * texts.length)];
    let attempts = 0;
    while (excludeTexts.includes(newText) && attempts < 50) {
      newText = texts[Math.floor(Math.random() * texts.length)];
      attempts++;
    }
    return newText;
  };

  const startGame = () => {
    // 커스텀 모드: 순서대로, 일반 모드: 랜덤
    const newText = useCustomMode 
      ? getRandomText(language, []) 
      : getRandomText(language, recentTexts);
    setTargetText(newText);
    
    // 일반 모드에서만 최근 문장 목록 업데이트
    if (!useCustomMode) {
      setRecentTexts(prev => {
        const updated = [...prev, newText];
        return updated.slice(-10); // 마지막 10개만 유지
      });
    }
    
    setUserInput('');
    setIsStarted(true);
    setIsFinished(false);
    setStartTime(null); // 첫 입력 시 타이머 시작
    setStats({
      wpm: 0,
      accuracy: 0,
      errors: 0,
      correctChars: 0,
      totalChars: 0,
      elapsedSeconds: 0,
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Space 키: 스크롤 방지 + 게임 시작/다음 문장
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;

      const target = e.target as HTMLElement;
      const isTypingInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // 입력 중이 아닐 때는 Space 기본 동작(페이지 스크롤) 막기
      if (!isTypingInput) {
        e.preventDefault();
        if (!isStarted || isFinished) {
          startGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStarted, isFinished]);

  // 실시간 타이머 — 문장 끝나면 일시정지, 다음 문장 입력 시 재개 (실제 타이핑 시간만 측정)
  useEffect(() => {
    const baseTime = totalStartTime || startTime;
    const useRoundTimer = !!totalStartTime;
    const shouldRun = isStarted && !showSummary && baseTime && (useRoundTimer || !isFinished);
    if (!shouldRun) return;

    const timer = setInterval(() => {
      if (totalStartTime) {
        // 라운드 모드: 누적 타이핑 시간 + 현재 문장 타이핑 중인 시간만 (문장 사이에는 증가 안 함)
        const currentSentenceMs = startTime && !isFinished ? Date.now() - startTime : 0;
        const activeElapsedMs = totalActiveSeconds * 1000 + currentSentenceMs;
        const newStats = calculateStats(userInput, targetText, activeElapsedMs, true, totalCorrectChars);
        setStats(newStats);
      } else if (startTime) {
        const elapsedMs = Date.now() - startTime;
        const newStats = calculateStats(userInput, targetText, elapsedMs, false, 0);
        setStats(newStats);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isStarted, isFinished, startTime, userInput, targetText, language, useCustomMode, totalStartTime, totalCorrectChars, totalActiveSeconds, showSummary]);

  /** elapsedMs: 밀리초 단위 경과 시간 (WPM 정밀 계산용) */
  const calculateStats = (
    input: string,
    target: string,
    elapsedMs: number,
    isRoundTiming: boolean,
    accumulatedCorrectChars: number
  ) => {
    let correctChars = 0;
    let errors = 0;

    for (let i = 0; i < input.length; i++) {
      if (input[i] === target[i]) {
        correctChars++;
      } else {
        errors++;
      }
    }

    const totalChars = input.length;
    const accuracy = totalChars > 0 ? (correctChars / totalChars) * 100 : 0;
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    const elapsedMinutes = elapsedMs / 60_000;

    // WPM: 밀리초 기반 정밀 계산. 정답 글자만 반영(오타는 자동으로 속도에 반영)
    const charsForWpm = isRoundTiming ? accumulatedCorrectChars + correctChars : correctChars;
    const wordsTyped = language === 'korean' ? charsForWpm : charsForWpm / 5;
    const rawWpm = elapsedMinutes > 0 ? wordsTyped / elapsedMinutes : 0;
    const wpm = Math.round(rawWpm * 10) / 10; // 소수 1자리

    return { wpm, accuracy, errors, correctChars, totalChars, elapsedSeconds };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isStarted || isFinished) return;

    const input = e.target.value;
    
    // 첫 입력 시 타이머 시작
    if (userInput.length === 0 && input.length > 0 && !startTime) {
      setStartTime(Date.now());
      // 커스텀 모드 또는 한/영 모드 라운드: 전체 타이머 시작(최종결과까지 끊기지 않음)
      if (!totalStartTime) {
        setTotalStartTime(Date.now());
      }
    }
    
    setUserInput(input);

    if (input === targetText) {
      setIsFinished(true);
      const useRoundTiming = !!totalStartTime;
      // 이 문장 타이핑한 시간만 누적 (문장 끝나면 측정 일시정지)
      const sentenceDurationSec = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      const newActiveTotal = totalActiveSeconds + sentenceDurationSec;

      if (useRoundTiming) {
        setTotalActiveSeconds(newActiveTotal);
        setTotalCorrectChars(prev => prev + (() => {
          let c = 0;
          for (let i = 0; i < input.length; i++) if (input[i] === targetText[i]) c++;
          return c;
        })());
      }
      // WPM·소요시간 = 누적 타이핑 시간 기준
      const activeElapsedMs = newActiveTotal * 1000;
      const finalStats = useRoundTiming
        ? calculateStats(input, targetText, activeElapsedMs, true, totalCorrectChars)
        : calculateStats(input, targetText, (startTime ? Date.now() - startTime : 0), false, 0);
      const finalStatsWithElapsed = useRoundTiming
        ? { ...finalStats, elapsedSeconds: newActiveTotal }
        : finalStats;
      setStats(finalStatsWithElapsed);

      // 통계 저장 및 카운트 증가
      const newCount = completedCount + 1;
      setCompletedCount(newCount);
      setAllStats([...allStats, finalStatsWithElapsed]);
      
      // 커스텀 모드: 다음 인덱스로 이동
      if (useCustomMode) {
        const selectedFolder = folders.find(f => f.id === selectedFolderId);
        setCustomTextIndex(prev => prev + 1);
        // 전체 커스텀 문장을 완료하면 요약 표시 + 목표 달성 시 축하 모달(최종결과 때만)
        if (selectedFolder && selectedFolder.sentences.length > 0 && (newCount % selectedFolder.sentences.length === 0)) {
          setShowSummary(true);
          const newStatsArray = [...allStats, finalStats];
          const avgWpm = newStatsArray.reduce((s, x) => s + x.wpm, 0) / newStatsArray.length;
          if (avgWpm >= targetWpm) {
            setAchievedWpm(avgWpm);
            setShowTargetAchievedModal(true);
          }
        }
      } else {
        // 일반 모드: 15문장마다 종합 결과 표시 + 목표 달성 시 축하 모달(최종결과 때만)
        if (newCount % 15 === 0) {
          setShowSummary(true);
          const newStatsArray = [...allStats, finalStats];
          const avgWpm = newStatsArray.reduce((s, x) => s + x.wpm, 0) / newStatsArray.length;
          if (avgWpm >= targetWpm) {
            setAchievedWpm(avgWpm);
            setShowTargetAchievedModal(true);
          }
        }
      }
    }
  };

  const changeLanguage = (lang: Language) => {
    // 커스텀 모드에서 나올 때는 항상 전환; 같은 언어이고 일반 모드일 때만 무시
    if (lang === language && !useCustomMode) return;
    reloadWithMode(lang, undefined, false); // 한/영 전환 시 커스텀 해제 후 새로고침
  };

  const restartGame = () => {
    startGame();
  };

  const calculateAverageStats = () => {
    if (allStats.length === 0) return null;
    
    // 커스텀 모드: 최근 폴더 문장 개수, 일반 모드: 최근 15개
    let statsCount = 15;
    if (useCustomMode) {
      const selectedFolder = folders.find(f => f.id === selectedFolderId);
      statsCount = selectedFolder && selectedFolder.sentences.length > 0 ? selectedFolder.sentences.length : 15;
    }
    const recentStats = allStats.slice(-statsCount);
    const avgWpm = Math.round((recentStats.reduce((sum, s) => sum + s.wpm, 0) / recentStats.length) * 10) / 10;
    const avgAccuracy = recentStats.reduce((sum, s) => sum + s.accuracy, 0) / recentStats.length;
    const avgTime = Math.round(recentStats.reduce((sum, s) => sum + s.elapsedSeconds, 0) / recentStats.length);
    const totalErrors = recentStats.reduce((sum, s) => sum + s.errors, 0);
    
    return { avgWpm, avgAccuracy, avgTime, totalErrors, count: recentStats.length };
  };

  const closeSummary = () => {
    // 최종결과를 리더보드에 저장 (표시값과 동일하게)
    const avgStats = calculateAverageStats();
    if (avgStats) {
      // 소요 시간: 해당 라운드 총 경과 시간 (마지막 문장 기준)
      const totalElapsed = allStats.length > 0
        ? allStats[allStats.length - 1].elapsedSeconds
        : avgStats.avgTime;
      const entry: LeaderboardEntry = {
        id: Date.now().toString(),
        wpm: avgStats.avgWpm,
        elapsedSeconds: totalElapsed,
        sentenceCount: avgStats.count,
        date: new Date().toISOString(),
        mode: useCustomMode ? 'custom' : 'normal',
        language: useCustomMode ? undefined : language,
        folderName: useCustomMode ? folders.find(f => f.id === selectedFolderId)?.name : undefined,
      };
      const updated = [entry, ...leaderboard].slice(0, 100); // 최대 100개
      setLeaderboard(updated);
      localStorage.setItem('typingLeaderboard', JSON.stringify(updated));
    }

    setShowSummary(false);
    // 최종결과 후 다음 라운드: 연속 측정용 상태 초기화
    if (useCustomMode) {
      setCustomTextIndex(0);
      setTotalStartTime(null);
      setTotalCorrectChars(0);
      setTotalActiveSeconds(0);
    } else {
      setTotalStartTime(null);
      setTotalCorrectChars(0);
    }
    startGame();
  };

  const createFolder = () => {
    if (newFolderName.trim()) {
      const newFolder: SentenceFolder = {
        id: Date.now().toString(),
        name: newFolderName.trim(),
        sentences: []
      };
      const updated = [...folders, newFolder];
      setFolders(updated);
      localStorage.setItem('sentenceFolders', JSON.stringify(updated));
      setNewFolderName('');
      // 첫 폴더 생성 시 자동 선택
      if (folders.length === 0) {
        setSelectedFolderId(newFolder.id);
        localStorage.setItem('selectedFolderId', newFolder.id);
      }
    }
  };

  const deleteFolder = (folderId: string) => {
    const updated = folders.filter(f => f.id !== folderId);
    setFolders(updated);
    localStorage.setItem('sentenceFolders', JSON.stringify(updated));
    // 삭제한 폴더가 선택된 폴더면 초기화
    if (selectedFolderId === folderId) {
      const newSelected = updated.length > 0 ? updated[0].id : null;
      setSelectedFolderId(newSelected);
      localStorage.setItem('selectedFolderId', newSelected || '');
    }
    if (editingFolderId === folderId) {
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const startEditingFolder = (folderId: string, currentName: string) => {
    setEditingFolderId(folderId);
    setEditingFolderName(currentName);
  };

  const saveFolderName = () => {
    if (!editingFolderId || !editingFolderName.trim()) {
      setEditingFolderId(null);
      setEditingFolderName('');
      return;
    }
    const updated = folders.map(f =>
      f.id === editingFolderId ? { ...f, name: editingFolderName.trim() } : f
    );
    setFolders(updated);
    localStorage.setItem('sentenceFolders', JSON.stringify(updated));
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const cancelEditingFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const closeCustomModal = () => {
    setShowCustomModal(false);
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const addCustomText = () => {
    if (newCustomText.trim() && selectedFolderId) {
      const updated = folders.map(folder => {
        if (folder.id === selectedFolderId) {
          return {
            ...folder,
            sentences: [...folder.sentences, newCustomText.trim()]
          };
        }
        return folder;
      });
      setFolders(updated);
      localStorage.setItem('sentenceFolders', JSON.stringify(updated));
      setNewCustomText('');
    }
  };

  const deleteCustomText = (folderId: string, index: number) => {
    const updated = folders.map(folder => {
      if (folder.id === folderId) {
        return {
          ...folder,
          sentences: folder.sentences.filter((_, i) => i !== index)
        };
      }
      return folder;
    });
    setFolders(updated);
    localStorage.setItem('sentenceFolders', JSON.stringify(updated));
  };

  const selectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    localStorage.setItem('selectedFolderId', folderId);
    setCustomTextIndex(0); // 폴더 변경 시 처음부터 시작
  };

  const toggleCustomMode = () => {
    reloadWithMode(undefined, undefined, !useCustomMode);
  };

  const saveTargetWpm = (value: number) => {
    setTargetWpm(value);
    localStorage.setItem('targetWpm', value.toString());
    setShowTargetModal(false);
  };

  const getCharacterClass = (index: number) => {
    if (index >= userInput.length) {
      return 'text-purple-300';
    }
    return userInput[index] === targetText[index]
      ? 'text-green-400 bg-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.5)]'
      : 'text-red-400 bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-pink-900 p-8 relative overflow-hidden">
      {/* 오락실 느낌의 배경 효과 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(139,92,246,0.1),transparent_50%)] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
      
      {/* 폴더 및 문장 관리 모달 */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900/95 to-purple-900/95 rounded-3xl p-8 max-w-5xl w-full max-h-[85vh] overflow-hidden border-4 border-purple-400 shadow-[0_0_60px_rgba(168,85,247,0.8)] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.8)]">
                📁 폴더 관리
              </h2>
              <button
                onClick={closeCustomModal}
                className="text-gray-400 hover:text-white text-3xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-6 flex-1 overflow-hidden">
              {/* 왼쪽: 폴더 목록 */}
              <div className="w-1/3 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-purple-300 mb-3">폴더 목록</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                      placeholder="새 폴더 이름..."
                      className="flex-1 px-3 py-2 bg-gray-950/60 border-2 border-purple-500/50 rounded-lg text-white placeholder-purple-400/50 focus:border-purple-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={createFolder}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-bold hover:scale-105 transition-all text-sm"
                    >
                      생성
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {folders.length === 0 ? (
                    <div className="text-center py-8 text-purple-400">
                      <p className="text-2xl mb-2">📁</p>
                      <p className="text-sm">폴더를 생성해주세요!</p>
                    </div>
                  ) : (
                    folders.map((folder) => (
                      <div
                        key={folder.id}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          editingFolderId === folder.id ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          selectedFolderId === folder.id && editingFolderId !== folder.id
                            ? 'bg-purple-500/30 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                            : 'bg-gray-950/50 border-purple-500/30 hover:border-purple-400/50'
                        }`}
                        onClick={() => editingFolderId !== folder.id && selectFolder(folder.id)}
                      >
                        {editingFolderId === folder.id ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveFolderName();
                                if (e.key === 'Escape') cancelEditingFolder();
                              }}
                              className="w-full px-2 py-1.5 bg-gray-950/80 border-2 border-cyan-500/50 rounded-lg text-white text-sm focus:border-cyan-400 focus:outline-none"
                              placeholder="폴더 이름"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={saveFolderName}
                                className="flex-1 px-2 py-1 bg-cyan-500/30 text-cyan-300 rounded text-xs font-semibold hover:bg-cyan-500/50"
                              >
                                저장
                              </button>
                              <button
                                onClick={cancelEditingFolder}
                                className="flex-1 px-2 py-1 bg-gray-600/30 text-gray-300 rounded text-xs font-semibold hover:bg-gray-600/50"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold truncate">{folder.name}</p>
                              <p className="text-purple-300 text-xs">{folder.sentences.length}개 문장</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingFolder(folder.id, folder.name);
                                }}
                                className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-semibold hover:bg-cyan-500/30 transition-colors"
                              >
                                수정
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`"${folder.name}" 폴더를 삭제하시겠습니까?`)) {
                                    deleteFolder(folder.id);
                                  }
                                }}
                                className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 오른쪽: 선택된 폴더의 문장 목록 */}
              <div className="flex-1 flex flex-col">
                {selectedFolderId ? (
                  <>
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-cyan-300 mb-3">
                        {folders.find(f => f.id === selectedFolderId)?.name} 문장
                      </h3>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCustomText}
                          onChange={(e) => setNewCustomText(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addCustomText()}
                          placeholder="문장을 입력하세요..."
                          className="flex-1 px-3 py-2 bg-gray-950/60 border-2 border-cyan-500/50 rounded-lg text-white placeholder-cyan-400/50 focus:border-cyan-400 focus:outline-none text-sm"
                        />
                        <button
                          onClick={addCustomText}
                          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-bold hover:scale-105 transition-all text-sm"
                        >
                          추가
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {(() => {
                        const folder = folders.find(f => f.id === selectedFolderId);
                        if (!folder || folder.sentences.length === 0) {
                          return (
                            <div className="text-center py-12 text-cyan-400">
                              <p className="text-2xl mb-2">📝</p>
                              <p>아직 추가된 문장이 없습니다.</p>
                              <p className="text-sm mt-2">위에서 문장을 추가해보세요!</p>
                            </div>
                          );
                        }
                        return folder.sentences.map((text, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 bg-gray-950/50 p-3 rounded-lg border border-cyan-500/30 hover:border-cyan-400/50 transition-colors"
                          >
                            <span className="text-cyan-400 font-mono text-xs">#{index + 1}</span>
                            <span className="flex-1 text-white text-sm">{text}</span>
                            <button
                              onClick={() => deleteCustomText(selectedFolderId, index)}
                              className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        ));
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-purple-400">
                    <div className="text-center">
                      <p className="text-3xl mb-4">👈</p>
                      <p className="text-lg">왼쪽에서 폴더를 선택하거나</p>
                      <p className="text-lg">새로 생성해주세요!</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={closeCustomModal}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-bold hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,211,238,0.5)]"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 목표 WPM 설정 모달 */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900/95 to-green-900/95 rounded-3xl p-8 max-w-md w-full border-4 border-green-400 shadow-[0_0_60px_rgba(34,197,94,0.8)]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(34,197,94,0.8)]">
                🎯 목표 WPM 설정
              </h2>
              <button
                onClick={() => setShowTargetModal(false)}
                className="text-gray-400 hover:text-white text-3xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-green-300 mb-4 text-center">
                달성하고 싶은 타자 속도를 설정하세요!
              </p>
              <div className="flex flex-col gap-3">
                <input
                  type="number"
                  value={targetWpm}
                  onChange={(e) => setTargetWpm(Math.max(1, parseInt(e.target.value) || 1))}
                  className="px-4 py-3 bg-gray-950/60 border-2 border-green-500/50 rounded-xl text-white text-center text-2xl font-bold focus:border-green-400 focus:outline-none focus:shadow-[0_0_20px_rgba(34,197,94,0.5)]"
                  min="1"
                  max="999"
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  {[50, 100, 150, 200, 250, 300].map(wpm => (
                    <button
                      key={wpm}
                      onClick={() => setTargetWpm(wpm)}
                      className="px-4 py-2 bg-green-500/20 text-green-300 rounded-lg font-semibold hover:bg-green-500/30 transition-colors border border-green-500/50"
                    >
                      {wpm}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => saveTargetWpm(targetWpm)}
                className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,197,94,0.5)]"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리더보드 모달 */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900/95 to-amber-900/95 rounded-3xl p-8 max-w-4xl w-full max-h-[85vh] overflow-hidden border-4 border-yellow-400 shadow-[0_0_60px_rgba(251,191,36,0.8)] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">
                🏆 리더보드
              </h2>
              <button
                onClick={() => setShowLeaderboardModal(false)}
                className="text-gray-400 hover:text-white text-3xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {(['all', 'korean', 'english', 'custom'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLeaderboardModeFilter(mode)}
                  className={`px-4 py-2 rounded-xl font-bold transition-all text-sm ${
                    leaderboardModeFilter === mode
                      ? 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.6)]'
                      : 'bg-gray-800/50 text-yellow-300 border-2 border-yellow-500/50 hover:bg-yellow-500/20'
                  }`}
                >
                  {mode === 'all' ? '📋 전체' : mode === 'korean' ? '🇰🇷 한글' : mode === 'english' ? '🇺🇸 영어' : '📁 커스텀'}
                </button>
              ))}
            </div>

            <p className="text-yellow-300/70 text-xs mb-2">
              타자속도(WPM) 순 · 선택한 모드만 표시
            </p>

            <div className="flex-1 overflow-y-auto">
              {(() => {
                const filtered = leaderboard.filter((entry) => {
                  if (leaderboardModeFilter === 'all') return true;
                  if (leaderboardModeFilter === 'korean') return entry.mode === 'normal' && (entry.language === 'korean' || !entry.language);
                  if (leaderboardModeFilter === 'english') return entry.mode === 'normal' && entry.language === 'english';
                  return entry.mode === 'custom';
                });
                const sorted = [...filtered].sort((a, b) => b.wpm - a.wpm).slice(0, 50);

                if (sorted.length === 0) {
                  return (
                    <div className="text-center py-16 text-yellow-400">
                      <p className="text-4xl mb-4">🏅</p>
                      <p className="text-xl font-bold">
                        {leaderboardModeFilter === 'all' ? '아직 기록이 없습니다!' : '이 모드의 기록이 없습니다.'}
                      </p>
                      <p className="text-sm mt-2">최종결과가 나오면 자동으로 저장됩니다.</p>
                    </div>
                  );
                }
                return (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-gray-900/95 z-10">
                      <tr className="text-yellow-300 border-b-2 border-yellow-500/50">
                        <th className="py-3 px-2">순위</th>
                        <th className="py-3 px-2">타자속도</th>
                        <th className="py-3 px-2">문장</th>
                        <th className="py-3 px-2 hidden sm:table-cell">날짜</th>
                        <th className="py-3 px-2 hidden md:table-cell">모드</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((entry, index) => {
                        const rank = index + 1;
                        const dateStr = new Date(entry.date).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const modeLabel = entry.mode === 'custom' ? `📁 ${entry.folderName || '커스텀'}` : entry.language === 'english' ? '영어' : '한글';
                        return (
                          <tr
                            key={entry.id}
                            className="border-b border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                          >
                            <td className="py-3 px-2 font-bold">
                              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                            </td>
                            <td className="py-3 px-2 font-bold text-cyan-400">{Number(entry.wpm).toFixed(1)} WPM</td>
                            <td className="py-3 px-2 text-white">{entry.sentenceCount}문장</td>
                            <td className="py-3 px-2 text-gray-400 text-sm hidden sm:table-cell">{dateStr}</td>
                            <td className="py-3 px-2 text-gray-400 text-sm hidden md:table-cell">{modeLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <p className="text-yellow-300/70 text-sm mt-4 text-center">
              최종결과가 나올 때마다 자동 저장 · 최대 100개 기록
            </p>
          </div>
        </div>
      )}
      
      {/* 목표 달성 축하 모달 */}
      {showTargetAchievedModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-gradient-to-br from-yellow-900/98 to-orange-900/98 rounded-3xl p-12 max-w-md w-full border-4 border-yellow-300 shadow-[0_0_80px_rgba(251,191,36,0.9)]">
            <div className="text-center">
              <p className="text-7xl mb-6">🎯</p>
              <h2 className="text-4xl font-bold text-yellow-200 mb-2 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">
                목표 달성!
              </h2>
              <p className="text-3xl font-bold text-yellow-400 mb-4 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]">
                축하합니다!
              </p>
              <p className="text-xl text-yellow-200/90 mb-2">
                목표: <span className="font-bold text-yellow-300">{targetWpm} WPM</span>
              </p>
              <p className="text-2xl font-bold text-yellow-300 mb-8">
                달성: <span className="text-yellow-400">{Number(achievedWpm).toFixed(1)} WPM</span>
              </p>
              <button
                onClick={() => setShowTargetAchievedModal(false)}
                className="px-10 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold text-xl rounded-xl shadow-[0_0_30px_rgba(251,191,36,0.8)] hover:scale-105 transition-all border-2 border-yellow-200"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 종합 결과 모달 */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-purple-900/95 to-pink-900/95 rounded-3xl p-10 max-w-2xl w-full border-4 border-cyan-400 shadow-[0_0_60px_rgba(34,211,238,0.8)]">
            <h2 className="text-5xl font-bold text-center mb-8 bg-gradient-to-r from-yellow-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">
              {useCustomMode ? '🏆 전체 문장 완료! 🏆' : '🏆 15문장 완료! 🏆'}
            </h2>
            
            {(() => {
              const avgStats = calculateAverageStats();
              if (!avgStats) return null;
              
              return (
                <>
                  <div className="mb-8 text-center">
                    <p className="text-3xl font-bold text-cyan-300 mb-2 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                      총 {completedCount}문장 완료!
                    </p>
                    <p className="text-lg text-purple-300">
                      {useCustomMode 
                        ? (() => {
                            const selectedFolder = folders.find(f => f.id === selectedFolderId);
                            const folderLength = selectedFolder ? selectedFolder.sentences.length : 0;
                            return `최근 ${folderLength}문장 평균 통계`;
                          })()
                        : '최근 15문장 평균 통계'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-gray-950/70 p-6 rounded-2xl border-2 border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                      <p className="text-cyan-300 text-sm mb-2">⚡ 평균 타자 속도</p>
                      <p className="text-5xl font-bold text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                        {Number(avgStats.avgWpm).toFixed(1)}
                      </p>
                      <p className="text-cyan-300/70 text-sm mt-1">WPM</p>
                    </div>
                    
                    <div className="bg-gray-950/70 p-6 rounded-2xl border-2 border-green-400/50 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                      <p className="text-green-300 text-sm mb-2">🎯 평균 정확도</p>
                      <p className="text-5xl font-bold text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]">
                        {avgStats.avgAccuracy.toFixed(1)}
                      </p>
                      <p className="text-green-300/70 text-sm mt-1">%</p>
                    </div>
                    
                    <div className="bg-gray-950/70 p-6 rounded-2xl border-2 border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                      <p className="text-purple-300 text-sm mb-2">⏱️ 소요 시간</p>
                      <p className="text-5xl font-bold text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]">
                        {allStats.length > 0 
                          ? allStats[allStats.length - 1].elapsedSeconds 
                          : avgStats.avgTime}
                      </p>
                      <p className="text-purple-300/70 text-sm mt-1">초</p>
                    </div>
                    
                    <div className="bg-gray-950/70 p-6 rounded-2xl border-2 border-red-400/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                      <p className="text-red-300 text-sm mb-2">❌ 총 오류</p>
                      <p className="text-5xl font-bold text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">
                        {avgStats.totalErrors}
                      </p>
                      <p className="text-red-300/70 text-sm mt-1">개</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={closeSummary}
                      className="px-12 py-5 bg-gradient-to-r from-yellow-500 via-pink-500 to-cyan-500 text-white rounded-2xl font-bold text-2xl shadow-[0_0_40px_rgba(251,191,36,0.8)] hover:scale-110 transition-all border-4 border-yellow-300"
                    >
                      🎮 계속하기
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto relative z-10">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] animate-pulse">
            도전! 타자왕
          </h1>
          <p className="text-cyan-300 text-lg font-semibold drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">
            한글과 영어 타자 속도를 향상시켜보세요!
          </p>
          <div className="mt-4 flex justify-center items-center gap-4 flex-wrap">
            <button
              onClick={() => setShowTargetModal(true)}
              className="px-6 py-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-2 border-green-400/50 rounded-full text-green-300 font-bold hover:scale-105 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              🎯 목표: {targetWpm} WPM
            </button>
            <button
              onClick={() => setShowLeaderboardModal(true)}
              className="px-6 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-400/50 rounded-full text-yellow-300 font-bold hover:scale-105 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)]"
            >
              🏆 리더보드
            </button>
          </div>
          {completedCount > 0 && (
            <div className="mt-4 inline-block px-6 py-2 bg-gradient-to-r from-yellow-500/20 to-pink-500/20 border-2 border-yellow-400/50 rounded-full">
              <p className="text-yellow-300 font-bold text-lg drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                {useCustomMode ? (
                  <>
                    {(() => {
                      const selectedFolder = folders.find(f => f.id === selectedFolderId);
                      const folderLength = selectedFolder ? selectedFolder.sentences.length : 0;
                      return `✨ 완료: ${completedCount}문장 / 다음 요약까지: ${folderLength > 0 ? folderLength - (completedCount % folderLength) : 0}문장`;
                    })()}
                  </>
                ) : (
                  <>
                    ✨ 완료: {completedCount}문장 / 다음 요약까지: {15 - (completedCount % 15)}문장
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {showMinigame ? (
          <TypingMinigame language={language} onClose={() => setShowMinigame(false)} />
        ) : (
        <>
        {/* 언어 선택 및 커스텀 모드 */}
        <div className="flex justify-center gap-4 mb-4">
          <button
            onClick={() => changeLanguage('korean')}
            className={`px-8 py-3 rounded-lg font-bold transition-all text-lg ${
              language === 'korean' && !useCustomMode
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-[0_0_20px_rgba(34,211,238,0.6)] scale-105 border-2 border-cyan-300'
                : 'bg-gray-800/50 text-gray-300 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] border-2 border-purple-500/30 backdrop-blur-sm'
            }`}
          >
            🇰🇷 한글
          </button>
          <button
            onClick={() => changeLanguage('english')}
            className={`px-8 py-3 rounded-lg font-bold transition-all text-lg ${
              language === 'english' && !useCustomMode
                ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.6)] scale-105 border-2 border-pink-300'
                : 'bg-gray-800/50 text-gray-300 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] border-2 border-purple-500/30 backdrop-blur-sm'
            }`}
          >
            🇺🇸 English
          </button>
          <button
            onClick={toggleCustomMode}
            className={`px-8 py-3 rounded-lg font-bold transition-all text-lg ${
              useCustomMode
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-[0_0_20px_rgba(251,191,36,0.6)] scale-105 border-2 border-yellow-300'
                : 'bg-gray-800/50 text-gray-300 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] border-2 border-purple-500/30 backdrop-blur-sm'
            }`}
          >
            ✏️ 커스텀
          </button>
          <button
            onClick={() => setShowMinigame(true)}
            className="px-8 py-3 rounded-lg font-bold transition-all text-lg bg-gray-800/50 text-gray-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] border-2 border-cyan-500/30 backdrop-blur-sm hover:border-cyan-400/60"
          >
            🎮 미니게임
          </button>
        </div>

        {/* 한글/영어 모드일 때만: 연습 유형 선택 (자리/낱말/짧은문장/긴문장) */}
        {!useCustomMode && (
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {([
              { key: 'position' as PracticeType, label: '자리연습' },
              { key: 'word' as PracticeType, label: '낱말연습' },
              { key: 'short' as PracticeType, label: '짧은문장연습' },
              { key: 'long' as PracticeType, label: '긴문장연습' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { if (key !== practiceType) reloadWithMode(undefined, key, undefined); }}
                className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  practiceType === key
                    ? 'bg-gradient-to-r from-cyan-500/90 to-blue-500/90 text-white shadow-[0_0_15px_rgba(34,211,238,0.5)] border-2 border-cyan-300'
                    : 'bg-gray-800/50 text-gray-400 border-2 border-gray-600/50 hover:border-cyan-500/50 hover:text-cyan-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        
        {/* 커스텀 문장 관리 버튼 */}
        <div className="flex justify-center mb-8">
          <button
            onClick={() => setShowCustomModal(true)}
            className="px-6 py-2 bg-gray-800/70 text-purple-300 rounded-lg font-semibold border-2 border-purple-500/50 hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all"
          >
            📁 폴더 관리 ({folders.length}개)
          </button>
        </div>

        {/* 게임 영역 */}
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.4)] p-8 mb-8 border-2 border-purple-500/30">
          {!isStarted ? (
            <div className="text-center py-16">
              <p className="text-2xl text-cyan-300 mb-6 font-semibold drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">
                {useCustomMode 
                  ? (() => {
                      const selectedFolder = folders.find(f => f.id === selectedFolderId);
                      return selectedFolder 
                        ? `📁 ${selectedFolder.name} (${selectedFolder.sentences.length}개 문장)`
                        : '폴더를 선택해주세요!';
                    })()
                  : (() => {
                      const typeLabels: Record<PracticeType, string> = {
                        position: '자리연습',
                        word: '낱말연습',
                        short: '짧은문장연습',
                        long: '긴문장연습',
                      };
                      return `${language === 'korean' ? '한글' : '영어'} · ${typeLabels[practiceType]} 타자 연습을 시작하세요!`;
                    })()
                }
              </p>
              {useCustomMode && (() => {
                const selectedFolder = folders.find(f => f.id === selectedFolderId);
                return !selectedFolder || selectedFolder.sentences.length === 0;
              })() ? (
                <div className="mb-6">
                  <p className="text-yellow-400 mb-4">⚠️ 먼저 문장을 추가해주세요!</p>
                  <button
                    onClick={() => setShowCustomModal(true)}
                    className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:scale-105 transition-all shadow-[0_0_20px_rgba(168,85,247,0.5)]"
                  >
                    📝 문장 추가하기
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={startGame}
                    className="px-12 py-5 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold text-xl shadow-[0_0_30px_rgba(139,92,246,0.8)] transition-all hover:scale-110 hover:shadow-[0_0_50px_rgba(139,92,246,1)] border-2 border-white/50 animate-pulse"
                  >
                    🚀 시작하기
                  </button>
                  <p className="text-sm text-purple-300 mt-6 font-semibold">
                    또는 <kbd className="px-3 py-1.5 bg-purple-800/50 border-2 border-purple-400 rounded text-sm font-mono shadow-[0_0_10px_rgba(168,85,247,0.5)]">Space</kbd> 키를 눌러주세요
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* 커스텀 모드 진행 상황 */}
              {useCustomMode && (() => {
                const selectedFolder = folders.find(f => f.id === selectedFolderId);
                return selectedFolder && selectedFolder.sentences.length > 0;
              })() && (
                <div className="mb-4 text-center">
                  <p className="text-lg font-bold text-yellow-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                    {(() => {
                      const selectedFolder = folders.find(f => f.id === selectedFolderId);
                      const folderLength = selectedFolder ? selectedFolder.sentences.length : 1;
                      return `📝 ${(customTextIndex % folderLength) + 1} / ${folderLength} 문장`;
                    })()}
                  </p>
                </div>
              )}
              
              {/* 목표 텍스트 */}
              <div className="mb-6 p-6 bg-gray-950/60 rounded-xl border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <p className="text-2xl font-mono leading-relaxed">
                  {targetText.split('').map((char, index) => (
                    <span key={index} className={`${getCharacterClass(index)} px-1 rounded transition-all duration-200`}>
                      {char}
                    </span>
                  ))}
                </p>
              </div>

              {/* 입력 필드 */}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={handleInputChange}
                  disabled={isFinished}
                  className="w-full px-6 py-4 text-2xl font-mono border-2 border-purple-500/50 rounded-xl focus:border-cyan-400 focus:outline-none focus:shadow-[0_0_20px_rgba(34,211,238,0.5)] bg-gray-950/60 text-white placeholder-purple-400/50 disabled:bg-gray-950/40 transition-all backdrop-blur-sm"
                  placeholder="여기에 입력하세요..."
                  autoComplete="off"
                  spellCheck="false"
                />
                {!startTime && userInput.length === 0 && (
                  <div className="absolute -top-10 left-0 right-0 text-center">
                    <p className="text-sm text-cyan-400 font-bold animate-pulse drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                      ⏱️ 타이핑을 시작하면 타이머가 시작됩니다
                    </p>
                  </div>
                )}
              </div>

              {/* 통계 */}
              <div className="mt-6 space-y-4">
                {/* 주요 통계 (크게 표시) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-cyan-950/60 to-blue-950/60 p-6 rounded-xl text-center border-2 border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.4)] backdrop-blur-sm">
                    <p className="text-base font-bold text-cyan-300 mb-2 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">⏱️ 소요 시간</p>
                    <p className="text-5xl font-bold text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                      {stats.elapsedSeconds}
                    </p>
                    <p className="text-sm text-cyan-300/70 mt-1">초</p>
                  </div>
                  <div className={`p-6 rounded-xl text-center border-2 backdrop-blur-sm ${
                    stats.wpm >= targetWpm 
                      ? 'bg-gradient-to-br from-yellow-950/60 to-orange-950/60 border-yellow-400/50 shadow-[0_0_20px_rgba(251,191,36,0.6)]'
                      : 'bg-gradient-to-br from-purple-950/60 to-pink-950/60 border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                  }`}>
                    <p className={`text-base font-bold mb-2 drop-shadow-[0_0_8px] ${
                      stats.wpm >= targetWpm ? 'text-yellow-300' : 'text-purple-300'
                    }`}>
                      ⚡ 타자 속도 {stats.wpm >= targetWpm && '🎯'}
                    </p>
                    <p className={`text-5xl font-bold drop-shadow-[0_0_15px] ${
                      stats.wpm >= targetWpm ? 'text-yellow-400' : 'text-purple-400'
                    }`}>
                      {Number(stats.wpm).toFixed(1)}
                    </p>
                    <p className={`text-sm mt-1 ${
                      stats.wpm >= targetWpm ? 'text-yellow-300/70' : 'text-purple-300/70'
                    }`}>
                      WPM / 목표: {targetWpm}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-green-950/60 to-emerald-950/60 p-6 rounded-xl text-center border-2 border-green-400/50 shadow-[0_0_20px_rgba(34,197,94,0.4)] backdrop-blur-sm">
                    <p className="text-base font-bold text-green-300 mb-2 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]">🎯 정확도</p>
                    <p className="text-5xl font-bold text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]">
                      {stats.accuracy.toFixed(0)}
                    </p>
                    <p className="text-sm text-green-300/70 mt-1">%</p>
                  </div>
                </div>
                
                {/* 상세 통계 (작게 표시) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-950/50 p-3 rounded-lg text-center border border-purple-500/30 backdrop-blur-sm">
                    <p className="text-xs text-purple-300 mb-1">✅ 정확한 글자</p>
                    <p className="text-xl font-bold text-purple-200">
                      {stats.correctChars}
                    </p>
                  </div>
                  <div className="bg-gray-950/50 p-3 rounded-lg text-center border border-purple-500/30 backdrop-blur-sm">
                    <p className="text-xs text-purple-300 mb-1">❌ 오류</p>
                    <p className="text-xl font-bold text-purple-200">
                      {stats.errors}
                    </p>
                  </div>
                </div>
              </div>

              {/* 완료 메시지 */}
              {isFinished && (
                <div className={`mt-6 p-8 rounded-2xl border-2 backdrop-blur-md ${
                  stats.wpm >= targetWpm
                    ? 'bg-gradient-to-r from-yellow-950/80 to-orange-950/80 border-yellow-400/50 shadow-[0_0_40px_rgba(251,191,36,0.6)]'
                    : 'bg-gradient-to-r from-green-950/80 to-emerald-950/80 border-green-400/50 shadow-[0_0_40px_rgba(34,197,94,0.6)]'
                }`}>
                  <p className={`text-4xl font-bold text-center mb-6 drop-shadow-[0_0_20px] ${
                    stats.wpm >= targetWpm ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {stats.wpm >= targetWpm ? '🎯 목표 달성! 축하합니다!' : '🎉 완료! 잘하셨습니다!'}
                  </p>
                  
                  {/* 최종 결과 요약 */}
                  <div className="bg-gray-950/70 rounded-xl p-6 mb-6 border-2 border-cyan-400/30 backdrop-blur-sm">
                    <h3 className="text-xl font-bold text-cyan-400 mb-4 text-center drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">📊 최종 결과</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-cyan-300 mb-1">소요 시간</p>
                        <p className="text-3xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">{stats.elapsedSeconds}초</p>
                      </div>
                      <div>
                        <p className={`text-sm mb-1 ${stats.wpm >= targetWpm ? 'text-yellow-300' : 'text-purple-300'}`}>
                          타자 속도 {stats.wpm >= targetWpm && '🎯'}
                        </p>
                        <p className={`text-3xl font-bold drop-shadow-[0_0_10px] ${
                          stats.wpm >= targetWpm ? 'text-yellow-400' : 'text-purple-400'
                        }`}>
                          {Number(stats.wpm).toFixed(1)} WPM
                        </p>
                        {stats.wpm >= targetWpm && (
                          <p className="text-xs text-yellow-300/70 mt-1">목표: {targetWpm} WPM</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-green-300 mb-1">정확도</p>
                        <p className="text-3xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">{stats.accuracy.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={restartGame}
                      className="px-10 py-4 bg-gradient-to-r from-green-500 via-cyan-500 to-blue-500 text-white rounded-xl font-bold text-xl hover:scale-110 transition-all shadow-[0_0_30px_rgba(34,197,94,0.8)] hover:shadow-[0_0_50px_rgba(34,197,94,1)] border-2 border-green-300"
                    >
                      🔄 다음 문장
                    </button>
                    <p className="text-sm text-cyan-300 font-semibold">
                      또는 <kbd className="px-3 py-1.5 bg-purple-800/50 border-2 border-purple-400 rounded text-sm font-mono shadow-[0_0_10px_rgba(168,85,247,0.5)]">Space</kbd> 키를 눌러주세요
                    </p>
                  </div>
                </div>
              )}

              {/* 재시작 버튼 */}
              {!isFinished && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={restartGame}
                    className="px-8 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg font-bold hover:scale-105 transition-all shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:shadow-[0_0_30px_rgba(168,85,247,0.8)] border-2 border-pink-400/50"
                  >
                    🔄 새로운 문장
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 팁 */}
        <div className="bg-gray-900/80 backdrop-blur-md rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.3)] p-6 border-2 border-purple-500/30">
          <h3 className="text-xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text mb-4 drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]">💡 타자 연습 팁</h3>
          <ul className="space-y-2 text-purple-200">
            <li className="hover:text-cyan-300 transition-colors">⏱️ 타이머는 첫 글자를 입력할 때부터 시작됩니다</li>
            <li className="hover:text-cyan-300 transition-colors">✨ 정확성을 우선시하고 속도는 자연스럽게 따라옵니다</li>
            <li className="hover:text-cyan-300 transition-colors">⌨️ 올바른 손가락 위치를 유지하세요</li>
            <li className="hover:text-cyan-300 transition-colors">🎯 매일 꾸준히 연습하면 실력이 향상됩니다</li>
            <li className="hover:text-cyan-300 transition-colors">👀 화면을 보면서 타이핑하는 것을 연습하세요</li>
            <li className="hover:text-cyan-300 transition-colors">⚡ <kbd className="px-3 py-1.5 bg-purple-800/50 border-2 border-purple-400 rounded text-sm font-mono shadow-[0_0_10px_rgba(168,85,247,0.5)]">Space</kbd> 키로 빠르게 다음 문장으로 이동하세요</li>
          </ul>
        </div>
      </>
        )}
      </div>
    </div>
  );
}
