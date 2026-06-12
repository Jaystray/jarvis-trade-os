"use client";

import {
  BookOpen,
  Bot,
  BrainCircuit,
  CloudSun,
  Clipboard,
  Code2,
  Copy,
  Eye,
  FileText,
  Gauge,
  MonitorUp,
  Lightbulb,
  Mic,
  MicOff,
  NotebookPen,
  Plus,
  Radio,
  Send,
  SquarePen,
  Upload,
  VolumeX
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JarvisCore from "@/components/JarvisCore";
import type {
  AgentRun,
  ChartWatchLog,
  ChatMessage,
  EconomicCalendarEvent,
  LocalLaunchResult,
  Memory,
  PineRebuild,
  TradeJournalEntry,
  TradingViewAlert,
  TradingViewPnlState,
  WorkspaceNote
} from "@/types";
import type { OnlineIntelResult } from "@/lib/online-intel";

type ModuleId =
  | "chat"
  | "online"
  | "launcher"
  | "strategy"
  | "journal"
  | "prompt"
  | "pine"
  | "review"
  | "watcher"
  | "agents"
  | "lessons";
type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onaudioend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onstart: (() => void) | null;
};
type AlertPnlValues = {
  dollars?: number;
  points?: number;
};
type TradingViewPnlValues = {
  dayDollars?: number;
  dayPoints?: number;
  source?: string;
  weekDollars?: number;
  weekPoints?: number;
};
type TradingViewPnlCache = TradingViewPnlValues & {
  dateKey: string;
};

const tradingViewPnlCacheKey = "jarvis-tradingview-pnl";
const minimumVoiceListenMs = 10000;

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const modules: Array<{ id: ModuleId; label: string; icon: React.ElementType }> = [
  { id: "chat", label: "Command Chat", icon: Radio },
  { id: "online", label: "Online Intel", icon: CloudSun },
  { id: "launcher", label: "App Launcher", icon: MonitorUp },
  { id: "strategy", label: "APEX Strategy Notes", icon: BookOpen },
  { id: "journal", label: "Daily Trade Journal", icon: NotebookPen },
  { id: "prompt", label: "Codex Prompt Builder", icon: Clipboard },
  { id: "pine", label: "Pine Rebuild Lab", icon: Code2 },
  { id: "review", label: "Trade Review Notes", icon: SquarePen },
  { id: "watcher", label: "Chart Watcher", icon: Eye },
  { id: "agents", label: "System Agents", icon: Bot },
  { id: "lessons", label: "Lessons Learned", icon: Lightbulb }
];

const noteSections = {
  strategy: "APEX Strategy Notes",
  review: "Trade Review Notes",
  lessons: "Lessons Learned"
} as const;

const emptyTrade: Partial<TradeJournalEntry> = {
  date: new Date().toISOString().slice(0, 10),
  market: "MNQ",
  direction: "Long",
  entry: "",
  stop: "",
  target: "",
  result: "",
  points: "",
  notes: "",
  mistakeTag: "",
  setupTag: ""
};

function isStopVoiceCommand(transcript: string) {
  const normalized = transcript.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  return [
    "stop",
    "stop talking",
    "jarvis stop",
    "jarvis stop talking",
    "stop jarvis",
    "shut up",
    "pause",
    "pause audio",
    "stop audio"
  ].includes(normalized);
}

export function AssistantDashboard() {
  const [active, setActive] = useState<ModuleId>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
  const [tradingViewAlerts, setTradingViewAlerts] = useState<TradingViewAlert[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [chartLogs, setChartLogs] = useState<ChartWatchLog[]>([]);
  const [economicEvents, setEconomicEvents] = useState<EconomicCalendarEvent[]>([]);
  const [economicCalendarError, setEconomicCalendarError] = useState("");
  const [pineRebuilds, setPineRebuilds] = useState<PineRebuild[]>([]);
  const [tradingViewPnlState, setTradingViewPnlState] = useState<TradingViewPnlState | null>(null);
  const [tradingViewPnlCache, setTradingViewPnlCache] = useState<TradingViewPnlCache | null>(null);
  const [input, setInput] = useState("");
  const [memoryInput, setMemoryInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningWindowActive, setListeningWindowActive] = useState(false);
  const [listeningUntil, setListeningUntil] = useState(0);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice mode is ready.");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastVoiceReply, setLastVoiceReply] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [chartIntakeStatus, setChartIntakeStatus] = useState("drop chart screenshot");
  const [latestIntel, setLatestIntel] = useState<OnlineIntelResult | null>(null);
  const [latestLaunch, setLatestLaunch] = useState<LocalLaunchResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isSendingRef = useRef(false);
  const isRecognitionRunningRef = useRef(false);
  const isGreetingActiveRef = useRef(false);
  const listeningHoldUntilRef = useRef(0);
  const listeningWindowActiveRef = useRef(false);
  const listeningRestartTimerRef = useRef<number | null>(null);
  const listeningWindowTimerRef = useRef<number | null>(null);

  const logMicrophonePermission = useCallback(async (context: string) => {
    if (!("permissions" in navigator)) {
      console.log("[Jarvis voice] microphone permission unavailable", { context });
      return;
    }

    try {
      const permission = await navigator.permissions.query({
        name: "microphone" as PermissionName
      });
      console.log("[Jarvis voice] microphone permission", { context, state: permission.state });
    } catch (error) {
      console.log("[Jarvis voice] microphone permission query failed", { context, error });
    }
  }, []);

  const keepVoiceSessionActive = useCallback(() => {
    voiceModeRef.current = true;
    setVoiceMode(true);
  }, []);

  const stopVoiceListening = useCallback((status = "Voice mode stopped.") => {
    voiceModeRef.current = false;
    isGreetingActiveRef.current = false;
    isRecognitionRunningRef.current = false;
    listeningWindowActiveRef.current = false;
    setVoiceMode(false);
    setListeningWindowActive(false);
    setListeningUntil(0);
    listeningHoldUntilRef.current = 0;
    if (listeningRestartTimerRef.current !== null) {
      window.clearTimeout(listeningRestartTimerRef.current);
      listeningRestartTimerRef.current = null;
    }
    if (listeningWindowTimerRef.current !== null) {
      window.clearTimeout(listeningWindowTimerRef.current);
      listeningWindowTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    setLiveTranscript("");
    setVoiceStatus(status);
    console.log("[Jarvis voice] stopped:", status);
  }, []);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    void logMicrophonePermission("dashboard mount");
  }, [logMicrophonePermission]);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(tradingViewPnlCacheKey);
      if (cached) setTradingViewPnlCache(JSON.parse(cached) as TradingViewPnlCache);
    } catch {
      setTradingViewPnlCache(null);
    }
  }, []);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    function tick() {
      setNow(new Date());
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const refreshMemories = useCallback(async () => {
    const res = await fetch("/api/memories");
    setMemories((await res.json()).memories);
  }, []);

  const addTranscriptLine = useCallback((line: string) => {
    const clean = line.trim();
    if (!clean) return;
    setTranscriptLines((current) => [clean, ...current.filter((item) => item !== clean)].slice(0, 5));
  }, []);

  const startListening = useCallback((interruptOnly = false, options?: { forceRestart?: boolean }) => {
    const recognition = recognitionRef.current;
    keepVoiceSessionActive();
    if (!recognition) {
      setVoiceStatus("Voice recognition is not available in this browser.");
      setIsListening(true);
      setListeningWindowActive(true);
      console.log("[Jarvis voice] SpeechRecognition is not available.");
      return;
    }
    if (listeningRestartTimerRef.current !== null) {
      window.clearTimeout(listeningRestartTimerRef.current);
      listeningRestartTimerRef.current = null;
    }
    if (listeningHoldUntilRef.current <= Date.now()) {
      listeningHoldUntilRef.current = Date.now() + minimumVoiceListenMs;
    }
    if (isRecognitionRunningRef.current && !options?.forceRestart) {
      setIsListening(true);
      setListeningWindowActive(true);
      setVoiceStatus(interruptOnly ? "Listening for stop command." : "Listening. Speak your command.");
      console.log("[Jarvis voice] recognition.start() skipped; already running", {
        continuous: recognition.continuous,
        holdUntil: new Date(listeningHoldUntilRef.current).toISOString()
      });
      return;
    }
    if (isRecognitionRunningRef.current && options?.forceRestart) {
      console.log("[Jarvis voice] recognition restart requested while active; stopping first.");
      recognition.stop();
      isRecognitionRunningRef.current = false;
    }
    console.log("[Jarvis voice] recognition.start() requested", {
      continuous: recognition.continuous,
      greetingActive: isGreetingActiveRef.current,
      holdUntil: new Date(listeningHoldUntilRef.current).toISOString()
    });
    try {
      recognition.start();
      isRecognitionRunningRef.current = true;
      setIsListening(true);
      setListeningWindowActive(true);
      setLiveTranscript("");
      setVoiceStatus(
        interruptOnly ? "Listening for stop command." : "Listening. Speak your command."
      );
      console.log("[Jarvis voice] listening started.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "InvalidStateError") {
        console.log("[Jarvis voice] recognition.start() InvalidStateError; stopping active session before retry.");
        try {
          recognition.stop();
        } catch (stopError) {
          console.log("[Jarvis voice] recognition.stop() before retry threw", stopError);
        }
        isRecognitionRunningRef.current = false;
        window.setTimeout(() => startListening(interruptOnly), 200);
        return;
      }
      setVoiceStatus("Listening is already active.");
      setIsListening(true);
      setListeningWindowActive(true);
      console.log("[Jarvis voice] recognition.start() threw", error);
    }
  }, [keepVoiceSessionActive]);

  const beginListeningWindow = useCallback((reason = "manual", options?: { startRecognition?: boolean }) => {
    keepVoiceSessionActive();
    if (listeningRestartTimerRef.current !== null) {
      window.clearTimeout(listeningRestartTimerRef.current);
      listeningRestartTimerRef.current = null;
    }
    if (listeningWindowTimerRef.current !== null) {
      window.clearTimeout(listeningWindowTimerRef.current);
      listeningWindowTimerRef.current = null;
    }

    listeningHoldUntilRef.current = Date.now() + minimumVoiceListenMs;
    listeningWindowActiveRef.current = true;
    setListeningUntil(listeningHoldUntilRef.current);
    setIsListening(true);
    setListeningWindowActive(true);
    setLiveTranscript("");
    setVoiceStatus("Listening. Speak your command.");
    console.log("[Jarvis voice] 10 second listening window opened", {
      reason,
      holdUntil: new Date(listeningHoldUntilRef.current).toISOString()
    });

    if (options?.startRecognition !== false) startListening();
    listeningWindowTimerRef.current = window.setTimeout(() => {
      listeningWindowTimerRef.current = null;
      if (Date.now() < listeningHoldUntilRef.current) return;
      listeningHoldUntilRef.current = 0;
      listeningWindowActiveRef.current = false;
      voiceModeRef.current = false;
      setVoiceMode(false);
      setIsListening(false);
      setListeningWindowActive(false);
      setListeningUntil(0);
      setVoiceStatus("Voice mode is ready.");
      recognitionRef.current?.stop();
      console.log("[Jarvis voice] 10 second listening window closed.", { reason });
    }, minimumVoiceListenMs);
  }, [keepVoiceSessionActive, startListening]);

  const speak = useCallback((text: string, afterSpeech?: () => void) => {
    console.log("[Jarvis voice] speech output disabled:", text.slice(0, 120));
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    afterSpeech?.();
  }, []);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setVoiceStatus(voiceModeRef.current ? "Speech stopped. Listening will resume." : "Speech stopped.");
    if (voiceModeRef.current) window.setTimeout(startListening, 250);
  }, [startListening]);

  const sendMessage = useCallback(
    async (value = input, options?: { persist?: boolean; showInChat?: boolean }) => {
      const message = value.trim();
      if (!message || isSending) return;
      const persist = options?.persist !== false;
      const showInChat = options?.showInChat !== false;
      isSendingRef.current = true;
      setIsSending(true);
      setVoiceStatus("Thinking.");
      setInput("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "primary", message, persist })
      });
      const data = await res.json();
      if (showInChat) {
        setMessages((current) => [...current, ...data.messages]);
      }
      if (data.onlineIntel) setLatestIntel(data.onlineIntel);
      if (data.localLaunch) setLatestLaunch(data.localLaunch);
      if (data.savedMemory) refreshMemories();
      const reply = data.messages?.find((item: ChatMessage) => item.role === "assistant")?.content;
      if (reply) {
        if (!showInChat) setLastVoiceReply(reply);
        if (!showInChat) addTranscriptLine(reply);
        speak(reply, () => {
          if (voiceModeRef.current) startListening();
        });
      }
      isSendingRef.current = false;
      setIsSending(false);
    },
    [addTranscriptLine, input, isSending, refreshMemories, speak, startListening]
  );

  useEffect(() => {
    async function refresh() {
      const [
        chatRes,
        memoryRes,
        notesRes,
        journalRes,
        agentsRes,
        chartRes,
        pineRes,
        tvRes,
        tvPnlRes,
        economicCalendarRes
      ] = await Promise.all([
        fetch("/api/chat?sessionId=primary"),
        fetch("/api/memories"),
        fetch("/api/notes"),
        fetch("/api/journal"),
        fetch("/api/agents"),
        fetch("/api/chart-watch"),
        fetch("/api/pine-rebuild"),
        fetch("/api/tradingview-alerts"),
        fetch("/api/tradingview-pnl"),
        fetch("/api/economic-calendar")
      ]);
      setMessages((await chatRes.json()).messages);
      setMemories((await memoryRes.json()).memories);
      setNotes((await notesRes.json()).notes);
      setEntries((await journalRes.json()).entries);
      setAgentRuns((await agentsRes.json()).runs);
      setChartLogs((await chartRes.json()).logs);
      setPineRebuilds((await pineRes.json()).rebuilds);
      setTradingViewAlerts((await tvRes.json()).alerts);
      setTradingViewPnlState((await tvPnlRes.json()).pnl);
      const economicCalendar = await economicCalendarRes.json();
      setEconomicEvents(economicCalendar.events || []);
      setEconomicCalendarError(economicCalendarRes.ok ? "" : economicCalendar.error || "Calendar unavailable.");
    }
    refresh();
  }, []);

  useEffect(() => {
    async function refreshEconomicCalendar() {
      const res = await fetch("/api/economic-calendar");
      const data = await res.json();
      setEconomicEvents(data.events || []);
      setEconomicCalendarError(res.ok ? "" : data.error || "Calendar unavailable.");
    }

    const interval = window.setInterval(refreshEconomicCalendar, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    async function refreshTradingView() {
      const [alertsRes, pnlRes] = await Promise.all([
        fetch("/api/tradingview-alerts"),
        fetch("/api/tradingview-pnl")
      ]);
      setTradingViewAlerts((await alertsRes.json()).alerts);
      setTradingViewPnlState((await pnlRes.json()).pnl);
    }

    const interval = window.setInterval(refreshTradingView, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const livePnl = getSavedTradingViewPnl(tradingViewPnlState) ?? getTradingViewPnl(tradingViewAlerts);
    if (!hasTradingViewPnlValue(livePnl)) return;

    setTradingViewPnlCache((current) => {
      const nextCache = buildTradingViewPnlCache(livePnl, current);
      if (isSameTradingViewPnlCache(current, nextCache)) return current;
      try {
        window.localStorage.setItem(tradingViewPnlCacheKey, JSON.stringify(nextCache));
      } catch {
        // Browser storage is optional; live database state remains the source of truth.
      }
      return nextCache;
    });
  }, [tradingViewAlerts, tradingViewPnlState]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("Voice recognition is not available in this browser.");
      console.log("[Jarvis voice] SpeechRecognition constructor missing.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      isRecognitionRunningRef.current = true;
      setIsListening(true);
      setListeningWindowActive(true);
      console.log("[Jarvis voice] recognition onstart", {
        greetingActive: isGreetingActiveRef.current,
        holdUntil: new Date(listeningHoldUntilRef.current || Date.now()).toISOString()
      });
    };
    recognition.onaudiostart = () => {
      console.log("[Jarvis voice] recognition onaudiostart");
    };
    recognition.onspeechstart = () => {
      console.log("[Jarvis voice] recognition onspeechstart", {
        greetingActive: isGreetingActiveRef.current
      });
    };
    recognition.onspeechend = () => {
      console.log("[Jarvis voice] recognition onspeechend", {
        shouldHoldListening: listeningHoldUntilRef.current > Date.now()
      });
    };
    recognition.onaudioend = () => {
      console.log("[Jarvis voice] recognition onaudioend", {
        shouldHoldListening: listeningHoldUntilRef.current > Date.now()
      });
    };
    recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const interim = results
        .filter((result) => !result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      const final = results
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();

      setLiveTranscript(final || interim);
      if (interim) console.log("[Jarvis voice] interim transcript:", interim);
      if (final) {
        console.log("[Jarvis voice] final transcript:", final);
        if (isGreetingActiveRef.current) {
          console.log("[Jarvis voice] ignored transcript during greeting:", final);
          return;
        }
        if (isStopVoiceCommand(final)) {
          if (isSpeakingRef.current) {
            stopSpeaking();
            setLiveTranscript("Stopped.");
            return;
          }
          stopVoiceListening("Voice mode stopped.");
          return;
        }

        if (isSpeakingRef.current) {
          setVoiceStatus("Speaking. Say stop to interrupt.");
          return;
        }

        setVoiceStatus(`Heard: ${final}`);
        addTranscriptLine(final);
        sendMessage(final, { persist: false, showInChat: false });
      }
    };
    recognition.onerror = (event) => {
      const shouldHoldListening = listeningHoldUntilRef.current > Date.now();
      isRecognitionRunningRef.current = false;
      console.log("[Jarvis voice] recognition error:", event.error, { shouldHoldListening });
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setIsListening(false);
        setListeningWindowActive(false);
        setVoiceStatus("Microphone access was blocked. Allow microphone access in the browser.");
        voiceModeRef.current = false;
        listeningWindowActiveRef.current = false;
        setVoiceMode(false);
        setLiveTranscript("");
        return;
      }

      if (event.error === "no-speech" || event.error === "aborted") {
        setVoiceStatus("Still listening. Ask your question when ready.");
        if (voiceModeRef.current && !isSpeakingRef.current && !isSendingRef.current && shouldHoldListening) {
          keepVoiceSessionActive();
          setIsListening(true);
          setListeningWindowActive(true);
          listeningRestartTimerRef.current = window.setTimeout(startListening, shouldHoldListening ? 200 : 500);
        } else {
          setIsListening(listeningWindowActiveRef.current);
        }
        return;
      }

      setVoiceStatus("Voice recognition paused. Listening will retry.");
      if (voiceModeRef.current && !isSpeakingRef.current && !isSendingRef.current && shouldHoldListening) {
        keepVoiceSessionActive();
        setIsListening(true);
        setListeningWindowActive(true);
        listeningRestartTimerRef.current = window.setTimeout(startListening, shouldHoldListening ? 250 : 800);
      } else {
        setIsListening(listeningWindowActiveRef.current);
      }
      setLiveTranscript("");
    };
    recognition.onend = () => {
      const shouldHoldListening = listeningHoldUntilRef.current > Date.now();
      isRecognitionRunningRef.current = false;
      console.log("[Jarvis voice] recognition ended.", { shouldHoldListening });
      if (voiceModeRef.current && !isSpeakingRef.current && !isSendingRef.current && shouldHoldListening) {
        keepVoiceSessionActive();
        setIsListening(true);
        setListeningWindowActive(true);
        setVoiceStatus(
          shouldHoldListening ? "Still listening. Ask your question when ready." : "Listening paused. Restarting."
        );
        listeningRestartTimerRef.current = window.setTimeout(startListening, shouldHoldListening ? 200 : 350);
      } else {
        setIsListening(listeningWindowActiveRef.current);
      }
    };
    recognitionRef.current = recognition;
  }, [addTranscriptLine, keepVoiceSessionActive, sendMessage, startListening, stopSpeaking, stopVoiceListening]);

  async function saveMemory() {
    const content = memoryInput.trim();
    if (!content) return;
    const res = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, tags: ["manual", "dashboard"] })
    });
    setMemories((await res.json()).memories);
    setMemoryInput("");
  }

  const analyzeChartFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      setChartIntakeStatus("reading chart image");
      const reader = new FileReader();
      reader.onload = async () => {
        setChartIntakeStatus("chart watcher scanning");
        const res = await fetch("/api/chart-watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: String(reader.result),
            notes: "MNQ 15 second APEX chart. Classify the setup state and risk."
          })
        });
        const data = await res.json();
        if (data.logs) setChartLogs(data.logs);
        const result = data.result;
        const line = result
          ? `${result.status.replaceAll("_", " ")}. ${result.summary}`
          : data.error || "Chart scan did not return a read.";
        setChartIntakeStatus(result ? result.status.replaceAll("_", " ").toLowerCase() : "scan error");
        addTranscriptLine(line);
        speak(line);
      };
      reader.onerror = () => {
        setChartIntakeStatus("image read failed");
      };
      reader.readAsDataURL(file);
    },
    [addTranscriptLine, speak]
  );

  function toggleMic() {
    if (voiceMode || isListening) {
      stopVoiceListening("Voice mode stopped.");
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      setVoiceStatus("Voice recognition is not available in this browser.");
      console.log("[Jarvis voice] core tap failed; SpeechRecognition is not available.");
      return;
    }

    listeningHoldUntilRef.current = Date.now() + minimumVoiceListenMs;
    console.log("[Jarvis voice] core tap direct recognition.start()", {
      continuous: recognition.continuous,
      holdUntil: new Date(listeningHoldUntilRef.current).toISOString(),
      speechSynthesisSpeaking: "speechSynthesis" in window ? window.speechSynthesis.speaking : false
    });
    try {
      recognition.start();
      isRecognitionRunningRef.current = true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "InvalidStateError") {
        console.log("[Jarvis voice] core tap start hit InvalidStateError; stopping before retry.");
        try {
          recognition.stop();
        } catch (stopError) {
          console.log("[Jarvis voice] core tap stop before retry threw", stopError);
        }
        isRecognitionRunningRef.current = false;
        window.setTimeout(() => startListening(false, { forceRestart: true }), 200);
      } else {
        console.log("[Jarvis voice] core tap direct recognition.start() threw", error);
      }
    }

    beginListeningWindow("core tap user gesture", { startRecognition: false });
    void logMicrophonePermission("core tap after start");
    console.log("[Jarvis voice] center core tapped. Listening without greeting.");
  }

  const activeLabel = modules.find((item) => item.id === active)?.label || "Command Chat";
  const savedTradingViewPnl = getSavedTradingViewPnl(tradingViewPnlState);
  const liveTradingViewPnl = savedTradingViewPnl ?? getTradingViewPnl(tradingViewAlerts);
  const tradingViewPnl = mergeTradingViewPnl(liveTradingViewPnl, tradingViewPnlCache);
  const journalDayPnl = getTodayPnl(entries);
  const journalWeekPnl = getWeekPnl(entries);
  const pnl = tradingViewPnl.dayDollars ?? journalDayPnl;
  const weekPnl = tradingViewPnl.weekDollars ?? journalWeekPnl;
  const latestDirection = entries[0]?.direction;
  const bias =
    latestDirection === "Long" ? "long" : latestDirection === "Short" ? "short" : "neutral";
  const isInListeningWindow = Boolean(now && listeningUntil > now.getTime());
  const coreState = isInListeningWindow || listeningWindowActive || voiceMode || isListening ? "listening" : isSpeaking ? "speaking" : "idle";
  const cycle = now
    ? getAmdCycle(now)
    : { activeMark: null, angle: 0, countdown: "--:--", inPivotWindow: false };

  return (
    <main className="radial-field">
      <FloatingNav active={active} setActive={setActive} />
      <CornerClusters
        activeLabel={activeLabel}
        chartLogs={chartLogs.length}
        entries={entries}
        memories={memories}
        memoryInput={memoryInput}
        notes={notes}
        now={now}
        onMemoryInput={setMemoryInput}
        onSaveMemory={saveMemory}
      />
      <FloatingPnl
        dayPnl={pnl}
        dayPoints={tradingViewPnl.dayPoints}
        source={tradingViewPnl.source}
        targetMax={400}
        targetMin={250}
        weekPnl={weekPnl}
        weekPoints={tradingViewPnl.weekPoints}
      />
      <FloatingOnlineIntel intel={latestIntel} />
      <FloatingLauncherStatus launch={latestLaunch} />
      <FloatingTradingViewFeed alerts={tradingViewAlerts} />
      <FloatingEconomicCalendar error={economicCalendarError} events={economicEvents} />
      <ChartIntake
        status={chartIntakeStatus}
        onChartFile={analyzeChartFile}
      />
      <section className="core-stage">
        <button className="core-button" onClick={toggleMic} title="Tap core to start or stop listening">
          <JarvisCore
            activeMark={cycle.activeMark}
            armAngle={cycle.angle}
            bias={bias}
            pnl={pnl}
            state={coreState}
          />
        </button>
        <p className="core-hint">tap core to listen</p>
        {(isInListeningWindow || listeningWindowActive || voiceMode || isListening) && (
          <p className={`voice-listening-label ${isInListeningWindow || listeningWindowActive || isListening ? "is-active" : ""}`}>
            {isInListeningWindow || listeningWindowActive || isListening ? "Listening..." : "Voice mode active"}
          </p>
        )}
        <SubtitleStack
          liveTranscript={liveTranscript}
          lines={transcriptLines}
          status={voiceStatus}
        />
      </section>
      <HoverCommand
        input={input}
        isSending={isSending}
        onInput={setInput}
        onSend={() => sendMessage()}
      />
      {active !== "chat" && (
        <div className="module-float">
          {active === "journal" && <TradeJournal entries={entries} setEntries={setEntries} />}
          {active === "online" && <OnlineIntelPanel latestIntel={latestIntel} setLatestIntel={setLatestIntel} />}
          {active === "launcher" && (
            <LocalLauncherPanel latestLaunch={latestLaunch} setLatestLaunch={setLatestLaunch} />
          )}
          {active === "prompt" && <PromptBuilder memories={memories} />}
          {active === "pine" && (
            <PineRebuildLab rebuilds={pineRebuilds} setRebuilds={setPineRebuilds} onSpeak={speak} />
          )}
          {active === "review" && <TradeReviewAI notes={notes} onSpeak={speak} setNotes={setNotes} />}
          {active === "watcher" && (
            <ChartWatcher logs={chartLogs} onSpeak={speak} setLogs={setChartLogs} />
          )}
          {active === "agents" && <SystemAgents runs={agentRuns} setRuns={setAgentRuns} onSpeak={speak} />}
          {(active === "strategy" || active === "lessons") && (
            <NotesModule notes={notes} setNotes={setNotes} section={noteSections[active]} />
          )}
        </div>
      )}
    </main>
  );
}

function FloatingNav(props: { active: ModuleId; setActive: (id: ModuleId) => void }) {
  return (
    <nav className="floating-nav">
      <div className="nav-brand">JARVIS Trade OS</div>
      {modules.map((item) => {
        const Icon = item.icon;
        const selected = props.active === item.id;
        return (
          <button
            className={`float-nav-item ${selected ? "is-selected" : ""}`}
            key={item.id}
            onClick={() => props.setActive(item.id)}
            title={item.label}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function CornerClusters(props: {
  activeLabel: string;
  chartLogs: number;
  entries: TradeJournalEntry[];
  memories: Memory[];
  memoryInput: string;
  notes: WorkspaceNote[];
  now: Date | null;
  onMemoryInput: (value: string) => void;
  onSaveMemory: () => void;
}) {
  return (
    <>
      <div className="corner-cluster top-left">
        <p className="corner-label">Session</p>
        <p>{props.activeLabel}</p>
        <p>ET {props.now ? formatEasternTime(props.now) : "--:--:--"}</p>
        <p>Chart logs {props.chartLogs}</p>
      </div>
      <div className="corner-cluster top-right memory-hover">
        <p className="corner-label">Memory</p>
        {props.memories.slice(0, 3).map((memory) => (
          <p key={memory.id}>{memory.title}</p>
        ))}
        <div className="hover-memory-input">
          <textarea
            onChange={(event) => props.onMemoryInput(event.target.value)}
            placeholder="Save memory..."
            value={props.memoryInput}
          />
          <button onClick={props.onSaveMemory}>Save</button>
        </div>
      </div>
      <div className="corner-cluster bottom-left">
        <p className="corner-label">Project</p>
        <p>APEX MNQ command center</p>
        <p>Trades {props.entries.length}</p>
      </div>
      <div className="corner-cluster bottom-right">
        <p className="corner-label">Context</p>
        {props.notes.slice(0, 3).map((note) => (
          <p key={note.id}>{note.title}</p>
        ))}
      </div>
    </>
  );
}

function FloatingPnl(props: {
  dayPnl: number;
  dayPoints?: number;
  source?: string;
  targetMax: number;
  targetMin: number;
  weekPnl: number;
  weekPoints?: number;
}) {
  const dayClass = props.dayPnl >= 0 ? "is-profit" : "is-loss";
  const weekClass = props.weekPnl >= 0 ? "is-profit" : "is-loss";
  return (
    <div className="floating-pnl">
      <p className="corner-label">P&L</p>
      <p>
        Today <span className={dayClass}>${Math.round(props.dayPnl)}</span>
      </p>
      {typeof props.dayPoints === "number" && (
        <p>
          Today&apos;s Points: <span className={dayClass}>{formatPoints(props.dayPoints)}</span>
        </p>
      )}
      <p>
        Week <span className={weekClass}>${Math.round(props.weekPnl)}</span>
      </p>
      {typeof props.weekPoints === "number" && (
        <p>
          Week&apos;s Points: <span className={weekClass}>{formatPoints(props.weekPoints)}</span>
        </p>
      )}
      <p>
        Target ${props.targetMin}-${props.targetMax}
      </p>
      {props.source && <p className="pnl-source">{props.source}</p>}
    </div>
  );
}

function FloatingOnlineIntel(props: { intel: OnlineIntelResult | null }) {
  const intel = props.intel;
  return (
    <div className="floating-online">
      <p className="corner-label">Online Intel</p>
      <p>{intel ? intel.kind : "standby"}</p>
      <p>{intel ? intel.summary : "Ask for weather, traffic, news, or web lookup."}</p>
      {intel?.source && <p>{intel.source}</p>}
    </div>
  );
}

function FloatingLauncherStatus(props: { launch: LocalLaunchResult | null }) {
  if (!props.launch) return null;
  return (
    <div className="floating-launcher">
      <p className="corner-label">Launcher</p>
      <p>{props.launch.launched ? "opened" : "blocked"}</p>
      <p>{props.launch.message}</p>
    </div>
  );
}

function FloatingTradingViewFeed(props: { alerts: TradingViewAlert[] }) {
  const latest = props.alerts[0];
  const latestSummary = latest ? formatTradingViewAlert(latest) : "";
  const latestDollars = latest
    ? readAlertNumber(latest, ["pnl", "profit", "profitUsd", "totalPnl", "dollars"]) ??
      parseDollarValue(latest.message)
    : undefined;
  const latestPoints = latest
    ? readAlertNumber(latest, ["points", "pts", "profitPoints", "totalPoints"]) ??
      parsePointValue(latest.message)
    : undefined;
  return (
    <div className="floating-tv-feed">
      <p className="corner-label">TradingView</p>
      <p>{latest ? `${latest.symbol} ${latest.timeframe}` : "waiting for webhook"}</p>
      {latest ? (
        <>
          <p>
            {latest.action} {latest.price}
          </p>
          {(latestDollars !== undefined || latestPoints !== undefined) && (
            <p>
              {latestDollars !== undefined ? `$${Math.round(latestDollars)}` : ""}
              {latestDollars !== undefined && latestPoints !== undefined ? " / " : ""}
              {latestPoints !== undefined ? `${formatPoints(latestPoints)} pts` : ""}
            </p>
          )}
          <p>{latestSummary}</p>
        </>
      ) : (
        <p>Connect alerts to /api/webhooks/tradingview</p>
      )}
    </div>
  );
}

function FloatingEconomicCalendar(props: { error: string; events: EconomicCalendarEvent[] }) {
  return (
    <section className="floating-economic-calendar" aria-label="Economic Calendar">
      <div className="economic-calendar-header">
        <p className="corner-label">Economic Calendar</p>
        <span>High Impact</span>
      </div>
      {props.error ? (
        <p className="economic-calendar-error">{props.error}</p>
      ) : props.events.length ? (
        <div className="economic-calendar-list">
          {props.events.slice(0, 3).map((event) => (
            <article className="economic-calendar-event" key={`${event.date}-${event.time}-${event.eventName}`}>
              <div>
                <p className="economic-calendar-time">
                  {event.date} · {event.time} ET
                </p>
                <h3>{event.eventName}</h3>
              </div>
              <p className="economic-calendar-values">
                F {event.forecast || "-"} · P {event.previous || "-"} · A {event.actual || "Pending"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="economic-calendar-empty">No high-impact events this week.</p>
      )}
    </section>
  );
}

function ChartIntake(props: {
  status: string;
  onChartFile: (file?: File) => void;
}) {
  return (
    <label
      className="chart-intake"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        props.onChartFile(event.dataTransfer.files?.[0]);
      }}
      title="Drop or upload a chart screenshot"
    >
      <span className="corner-label">Chart Intake</span>
      <span>{props.status}</span>
      <span className="chart-intake-action">hover / drop / click upload</span>
      <input
        accept="image/*"
        type="file"
        onChange={(event) => props.onChartFile(event.target.files?.[0])}
      />
    </label>
  );
}

function SubtitleStack(props: {
  liveTranscript: string;
  lines: string[];
  status: string;
}) {
  const activeLine = props.liveTranscript || props.lines[0] || props.status;
  return (
    <div className="subtitle-stack">
      <p className="subtitle-line line-0">{activeLine}</p>
    </div>
  );
}

function LocalLauncherPanel(props: {
  latestLaunch: LocalLaunchResult | null;
  setLatestLaunch: (launch: LocalLaunchResult) => void;
}) {
  const [isLoading, setIsLoading] = useState("");
  const targets = [
    { id: "tradingview", label: "TradingView", hint: "Open TradingView" },
    { id: "mnq", label: "MNQ", hint: "Open MNQ chart" },
    { id: "nq", label: "NQ", hint: "Open NQ chart" }
  ];

  async function launch(targetId: string) {
    if (isLoading) return;
    setIsLoading(targetId);
    try {
      const res = await fetch("/api/local-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId })
      });
      const data = await res.json();
      props.setLatestLaunch(data.result);
    } finally {
      setIsLoading("");
    }
  }

  return (
    <section className="terminal-skin mx-auto max-w-3xl space-y-5 bg-[#070B12]/80 p-6">
      <div>
        <p className="section-label">Local App Launcher</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#D5DCEA]">Mac Control</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#5C6880]">
          Launch allowlisted local apps and chart URLs from Jarvis. Voice commands work too:
          “open TradingView” or “open MNQ.”
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {targets.map((target) => (
          <button
            className="bg-[#0D1320] px-5 py-4 text-left text-sm uppercase tracking-[0.18em] text-[#D5DCEA]"
            disabled={Boolean(isLoading)}
            key={target.id}
            onClick={() => launch(target.id)}
          >
            <span className="block text-[#F0A52E]">{isLoading === target.id ? "Opening" : target.label}</span>
            <span className="mt-2 block text-[11px] normal-case tracking-normal text-[#5C6880]">
              {target.hint}
            </span>
          </button>
        ))}
      </div>
      {props.latestLaunch && (
        <div className="space-y-2 text-sm text-[#D5DCEA]">
          <p className="section-label">Last Command</p>
          <p>{props.latestLaunch.message}</p>
          {props.latestLaunch.target && <p className="text-[#5C6880]">{props.latestLaunch.target.label}</p>}
        </div>
      )}
    </section>
  );
}

function OnlineIntelPanel(props: {
  latestIntel: OnlineIntelResult | null;
  setLatestIntel: (intel: OnlineIntelResult) => void;
}) {
  const [query, setQuery] = useState("weather in New York");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function runLookup() {
    const value = query.trim();
    if (!value || isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/online-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Online lookup failed.");
      props.setLatestIntel(data.intel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Online lookup failed.");
    } finally {
      setIsLoading(false);
    }
  }

  const intel = props.latestIntel;

  return (
    <section className="terminal-skin mx-auto max-w-3xl space-y-5 bg-[#070B12]/80 p-6">
      <div>
        <p className="section-label">Online Intel Agent</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#D5DCEA]">Live Data Lookup</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#5C6880]">
          Ask for weather, temperature, traffic, market headlines, news, or a general web lookup.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <textarea
          className="min-h-24 resize-none bg-[#0D1320] p-4 text-sm text-[#D5DCEA] outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Example: traffic from Fresno CA to San Jose CA"
          value={query}
        />
        <button
          className="bg-[#0D1320] px-5 py-3 text-sm uppercase tracking-[0.18em] text-[#F0A52E]"
          disabled={isLoading}
          onClick={runLookup}
        >
          {isLoading ? "Checking" : "Run"}
        </button>
      </div>
      {error && <p className="text-sm text-[#EF5468]">{error}</p>}
      {intel && (
        <div className="space-y-3 text-sm text-[#D5DCEA]">
          <p className="section-label">{intel.kind}</p>
          <p className="text-lg">{intel.summary}</p>
          {intel.details?.map((detail) => (
            <p key={detail} className="text-[#5C6880]">
              {detail}
            </p>
          ))}
          {intel.missingConfig?.length ? (
            <p className="text-[#F0A52E]">Missing setup: {intel.missingConfig.join(", ")}</p>
          ) : null}
          {intel.url && (
            <a className="text-[#F0A52E]" href={intel.url} rel="noreferrer" target="_blank">
              Source link
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function HoverCommand(props: {
  input: string;
  isSending: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="hover-command">
      <span>Manual command</span>
      <textarea
        onChange={(event) => props.onInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.onSend();
          }
        }}
        placeholder="Type only when needed..."
        value={props.input}
      />
      <button disabled={props.isSending} onClick={props.onSend}>
        Send
      </button>
    </div>
  );
}

function TopRail(props: {
  activeLabel: string;
  chartLogs: number;
  now: Date | null;
  voiceOnline: boolean;
}) {
  const et = props.now ? formatEasternTime(props.now) : "--:--:--";
  return (
    <div className="status-strip grid grid-cols-[180px_1fr_auto] items-center gap-4">
      <div className="font-data text-[13px] uppercase tracking-[0.22em] text-[#D5DCEA]">
        JARVIS TRADE OS
      </div>
      <div className="flex min-w-0 items-center gap-5 overflow-hidden font-data text-[11px] uppercase tracking-[0.18em] text-[#5C6880]">
        <span className="truncate text-[#D5DCEA]">{props.activeLabel}</span>
        <span>Chart logs {props.chartLogs}</span>
        <span>Voice {props.voiceOnline ? "Armed" : "Idle"}</span>
        <span>Memory linked</span>
      </div>
      <div className="font-data text-[13px] uppercase tracking-[0.18em] text-[#D5DCEA]">{et}</div>
    </div>
  );
}

function formatEasternTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York"
  }).format(date);
}

function getKillzone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "America/New_York"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const total = hour * 60 + minute;
  if (total >= 19 * 60 && total < 23 * 60) return "Asia";
  if (total >= 2 * 60 && total < 5 * 60) return "London";
  if (total >= 8 * 60 + 30 && total < 11 * 60) return "NY AM";
  return "Off hours";
}

function getAmdCycle(date: Date) {
  const seconds = date.getMinutes() * 60 + date.getSeconds();
  const cycleSeconds = seconds % 600;
  const minuteInCycle = Math.floor(cycleSeconds / 60);
  const secondInMinute = cycleSeconds % 60;
  const pivots = [3, 6, 9, 13];
  const nextPivotMinute = pivots.find((pivot) => minuteInCycle < pivot) || 13;
  const remaining = (nextPivotMinute - minuteInCycle) * 60 - secondInMinute;
  const angle = (cycleSeconds / 600) * 360;
  const activeMark = [3, 6, 9].includes(minuteInCycle)
    ? (String(minuteInCycle) as "3" | "6" | "9")
    : null;
  const inPivotWindow = [3, 6, 9].includes(minuteInCycle);
  return {
    activeMark,
    angle,
    countdown: `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
    inPivotWindow
  };
}

function getTodayPnl(entries: TradeJournalEntry[]) {
  const today = new Date().toISOString().slice(0, 10);
  return entries
    .filter((entry) => entry.date === today)
    .reduce((total, entry) => total + (Number.parseFloat(entry.points) || 0), 0);
}

function getWeekPnl(entries: TradeJournalEntry[]) {
  const today = new Date();
  const start = new Date(today);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  return entries
    .filter((entry) => {
      const entryDate = new Date(`${entry.date}T00:00:00`);
      return entryDate >= start && entryDate <= today;
    })
    .reduce((total, entry) => total + (Number.parseFloat(entry.points) || 0), 0);
}

function mergeTradingViewPnl(
  livePnl: TradingViewPnlValues,
  cache: TradingViewPnlCache | null
): TradingViewPnlValues {
  const todayKey = getEasternDateKey(new Date());
  const useCachedDay = cache?.dateKey === todayKey;

  return {
    dayDollars: livePnl.dayDollars ?? (useCachedDay ? cache?.dayDollars : undefined),
    dayPoints: livePnl.dayPoints ?? (useCachedDay ? cache?.dayPoints : undefined),
    source: livePnl.source ?? cache?.source,
    weekDollars: livePnl.weekDollars ?? cache?.weekDollars,
    weekPoints: livePnl.weekPoints ?? cache?.weekPoints
  };
}

function buildTradingViewPnlCache(
  livePnl: TradingViewPnlValues,
  cache: TradingViewPnlCache | null
): TradingViewPnlCache {
  const dateKey = getEasternDateKey(new Date());
  const useCachedDay = cache?.dateKey === dateKey;

  return {
    dateKey,
    dayDollars: livePnl.dayDollars ?? (useCachedDay ? cache?.dayDollars : undefined),
    dayPoints: livePnl.dayPoints ?? (useCachedDay ? cache?.dayPoints : undefined),
    source: livePnl.source ?? cache?.source ?? "TradingView",
    weekDollars: livePnl.weekDollars ?? cache?.weekDollars,
    weekPoints: livePnl.weekPoints ?? cache?.weekPoints
  };
}

function hasTradingViewPnlValue(values: TradingViewPnlValues) {
  return (
    values.dayDollars !== undefined ||
    values.dayPoints !== undefined ||
    values.weekDollars !== undefined ||
    values.weekPoints !== undefined
  );
}

function isSameTradingViewPnlCache(left: TradingViewPnlCache | null, right: TradingViewPnlCache) {
  return (
    left?.dateKey === right.dateKey &&
    left.dayDollars === right.dayDollars &&
    left.dayPoints === right.dayPoints &&
    left.source === right.source &&
    left.weekDollars === right.weekDollars &&
    left.weekPoints === right.weekPoints
  );
}

function getEasternDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function getSavedTradingViewPnl(state: TradingViewPnlState | null) {
  if (!state) return null;
  const dayDollars = parseNumberValue(state.todayPnl);
  const dayPoints = parseNumberValue(state.todayPoints);
  const weekDollars = parseNumberValue(state.weekPnl);
  const weekPoints = parseNumberValue(state.weekPoints);

  if (
    dayDollars === undefined &&
    dayPoints === undefined &&
    weekDollars === undefined &&
    weekPoints === undefined
  ) {
    return null;
  }

  return {
    dayDollars,
    dayPoints,
    source: "APEX Analytics",
    weekDollars,
    weekPoints
  };
}

function getTradingViewPnl(alerts: TradingViewAlert[]) {
  const today = new Date();
  const start = new Date(today);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const todayKey = today.toISOString().slice(0, 10);
  const todayAlerts = alerts.filter((alert) => alert.createdAt.slice(0, 10) === todayKey);
  const weekAlerts = alerts.filter((alert) => new Date(`${alert.createdAt.replace(" ", "T")}`) >= start);
  const dayValues = getLatestAggregatePnl(todayAlerts, "day");
  const weekValues = getLatestAggregatePnl(weekAlerts, "week");

  return {
    dayDollars: dayValues.dollars,
    dayPoints: dayValues.points,
    source: dayValues.dollars !== undefined || dayValues.points !== undefined ? "TradingView" : undefined,
    weekDollars: weekValues.dollars,
    weekPoints: weekValues.points
  };
}

function getLatestAggregatePnl(alerts: TradingViewAlert[], period: "day" | "week"): AlertPnlValues {
  for (const alert of alerts) {
    const dollars = readAlertNumber(alert, aggregateDollarKeys(period));
    const points = readAlertNumber(alert, aggregatePointKeys(period));
    const parsedDollars = parseLabeledDollarValue(alert.message, period);
    const parsedPoints = parseLabeledPointValue(alert.message, period);
    if (
      dollars !== undefined ||
      points !== undefined ||
      parsedDollars !== undefined ||
      parsedPoints !== undefined
    ) {
      const finalPoints = points ?? parsedPoints;
      return {
        dollars: dollars ?? parsedDollars ?? (finalPoints !== undefined ? finalPoints * 2 : undefined),
        points: finalPoints
      };
    }
  }
  return {};
}

function getLatestAlertPnl(alerts: TradingViewAlert[]): AlertPnlValues {
  for (const alert of alerts) {
    const dollars = readAlertNumber(alert, [
      "pnl",
      "profit",
      "profitUsd",
      "profit_usd",
      "dollars",
      "tradePnl",
      "trade_pnl"
    ]);
    const points = readAlertNumber(alert, [
      "points",
      "pts",
      "profitPoints",
      "profit_points",
      "tradePoints",
      "trade_points"
    ]);
    const parsedDollars = dollars ?? parseDollarValue(alert.message);
    const parsedPoints = points ?? parsePointValue(alert.message);
    if (parsedDollars !== undefined || parsedPoints !== undefined) {
      return {
        dollars: parsedDollars ?? (parsedPoints !== undefined ? parsedPoints * 2 : undefined),
        points: parsedPoints
      };
    }
  }
  return {};
}

function aggregateDollarKeys(period: "day" | "week") {
  return period === "day"
    ? [
        "todayPnl",
        "today_pnl",
        "todayDollars",
        "today_dollars",
        "dayPnl",
        "day_pnl",
        "dailyPnl",
        "daily_pnl",
        "dailyDollars",
        "daily_dollars",
        "dashboardPnl",
        "dashboard_pnl"
      ]
    : [
        "weekPnl",
        "week_pnl",
        "weeklyPnl",
        "weekly_pnl",
        "weekDollars",
        "week_dollars",
        "weeklyDollars",
        "weekly_dollars"
      ];
}

function aggregatePointKeys(period: "day" | "week") {
  return period === "day"
    ? [
        "todayPoints",
        "today_points",
        "todayPts",
        "today_pts",
        "dayPoints",
        "day_points",
        "dayPts",
        "day_pts",
        "dailyPoints",
        "daily_points",
        "dailyPts",
        "daily_pts",
        "dashboardPoints",
        "dashboard_points"
      ]
    : [
        "weekPoints",
        "week_points",
        "weekPts",
        "week_pts",
        "weeklyPoints",
        "weekly_points",
        "weeklyPts",
        "weekly_pts"
      ];
}

function readAlertNumber(alert: TradingViewAlert, keys: string[]) {
  for (const key of keys) {
    const value = alert.rawPayload[key];
    const parsed = parseNumberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDollarValue(text: string) {
  const match = text.match(/\$ ?(-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)/);
  return match?.[1] ? parseNumberValue(match[1]) : undefined;
}

function parsePointValue(text: string) {
  const match = text.match(/(-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(?:points|pts)\b/i);
  return match?.[1] ? parseNumberValue(match[1]) : undefined;
}

function parseLabeledDollarValue(text: string, period: "day" | "week") {
  const label = period === "day" ? "(?:today|day|daily)" : "(?:week|weekly)";
  const afterLabel = text.match(new RegExp(`${label}[^$\\n\\r]*\\$ ?(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)`, "i"));
  if (afterLabel?.[1]) return parseNumberValue(afterLabel[1]);

  const beforeLabel = text.match(new RegExp(`\\$ ?(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)[^\\n\\r]*(?:${label})`, "i"));
  return beforeLabel?.[1] ? parseNumberValue(beforeLabel[1]) : undefined;
}

function parseLabeledPointValue(text: string, period: "day" | "week") {
  const label = period === "day" ? "(?:today|day|daily)" : "(?:week|weekly)";
  const afterLabel = text.match(
    new RegExp(`${label}[^\\n\\r]*?(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)\\s*(?:points|pts)`, "i")
  );
  if (afterLabel?.[1]) return parseNumberValue(afterLabel[1]);

  const beforeLabel = text.match(
    new RegExp(`(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)\\s*(?:points|pts)[^\\n\\r]*(?:${label})`, "i")
  );
  return beforeLabel?.[1] ? parseNumberValue(beforeLabel[1]) : undefined;
}

function formatTradingViewAlert(alert: TradingViewAlert) {
  const payload = alert.rawPayload;
  const parts = [
    readPayloadString(payload, ["event", "grade"]) || alert.action,
    readPayloadString(payload, ["setup"]),
    readPayloadString(payload, ["level"]),
    formatRibbon(payload),
    readPayloadString(payload, ["score"]) ? `score ${readPayloadString(payload, ["score"])}` : "",
    readPayloadString(payload, ["smt_read"])
  ].filter((part) => part && part !== "-" && part !== "NONE");

  return parts.join(" | ").slice(0, 96);
}

function formatRibbon(payload: Record<string, unknown>) {
  const ribbon = readPayloadString(payload, ["ribbon"]);
  const strength = readPayloadString(payload, ["ribbon_strength", "strength"]);
  return ribbon ? `${ribbon}${strength ? ` ${strength}` : ""}` : "";
}

function readPayloadString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function SessionCore(props: {
  activeLabel: string;
  entries: TradeJournalEntry[];
  now: Date | null;
}) {
  const killzone = props.now ? getKillzone(props.now) : "Loading";
  const cycle = props.now
    ? getAmdCycle(props.now)
    : { activeMark: null, angle: 0, countdown: "--:--", inPivotWindow: false };
  const pnl = getTodayPnl(props.entries);
  const latestDirection = props.entries[0]?.direction;
  const bias = latestDirection === "Long" || latestDirection === "Short" ? latestDirection.toUpperCase() : "NEUTRAL";
  const biasClass =
    bias === "LONG" ? "text-[#3DD68C]" : bias === "SHORT" ? "text-[#EF5468]" : "text-[#D5DCEA]";
  const pnlPercent = Math.max(0, Math.min(100, (Math.abs(pnl) / 400) * 100));

  return (
    <div className="session-core">
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="section-label">Session Core</span>
            <span className={`killzone-label ${killzone !== "Off hours" ? "is-active" : ""}`}>
              {killzone}
            </span>
            <span className="font-data text-[13px] text-[#5C6880]">
              ET {props.now ? formatEasternTime(props.now) : "--:--:--"}
            </span>
            <span className="font-data text-[13px] text-[#5C6880]">{props.activeLabel}</span>
          </div>
          <div className="amd-cluster">
            <div className="amd-dial" style={{ "--dial-angle": `${cycle.angle}deg` } as React.CSSProperties}>
              <span className="amd-mark mark-3">:3</span>
              <span className="amd-mark mark-6">:6</span>
              <span className="amd-mark mark-9">:9</span>
              <span className="amd-hand" />
              <div className="amd-center">AMD</div>
            </div>
            <div className="pivot-panel">
              <p className="section-label">Next pivot</p>
              <p className={`pivot-countdown ${cycle.inPivotWindow ? "pulse-once" : ""}`}>
                {cycle.countdown}
              </p>
              <p className="mt-2 font-data text-[13px] uppercase tracking-[0.16em] text-[#5C6880]">
                10 minute cycle marks at :3 :6 :9
              </p>
            </div>
          </div>
        </div>
        <div className="session-readout">
          <div>
            <p className="section-label">Session bias</p>
            <p className={`font-data text-[28px] ${biasClass}`}>{bias}</p>
          </div>
          <div>
            <div className="mb-2 flex items-end justify-between">
              <p className="section-label">Today P&L target</p>
              <p className={`font-data text-[28px] ${pnl >= 0 ? "text-[#3DD68C]" : "text-[#EF5468]"}`}>
                ${Math.round(pnl)}
              </p>
            </div>
            <div className="pnl-track">
              <span
                className={`pnl-fill ${pnl < 0 ? "is-loss" : ""}`}
                style={{ width: `${pnlPercent}%` }}
              />
            </div>
            <p className="mt-2 font-data text-[11px] uppercase tracking-[0.14em] text-[#5C6880]">
              $250-400 objective
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar(props: { active: ModuleId; setActive: (id: ModuleId) => void }) {
  return (
    <aside className="left-rail group">
      <div className="mb-5 flex h-12 items-center gap-3 px-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[#0D1320] text-[#D5DCEA]">
          <Gauge size={24} />
        </div>
        <div className="rail-label">
          <p className="section-label">Jarvis</p>
          <h1 className="whitespace-nowrap text-[16px] font-semibold text-[#D5DCEA]">Trade OS</h1>
        </div>
      </div>
      <nav className="space-y-1">
        {modules.map((item) => {
          const Icon = item.icon;
          const selected = props.active === item.id;
          return (
            <button
              className={`rail-button ${
                selected
                  ? "is-selected"
                  : ""
              }`}
              key={item.id}
              onClick={() => props.setActive(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              <span className="rail-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function ChatPanel(props: {
  messages: ChatMessage[];
  input: string;
  isListening: boolean;
  isSending: boolean;
  voiceMode: boolean;
  voiceStatus: string;
  liveTranscript: string;
  lastVoiceReply: string;
  onInput: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
}) {
  const recentMessages = props.messages.slice(-4);
  const latestAssistant =
    [...props.messages].reverse().find((message) => message.role === "assistant")?.content || "";
  const activeReply = props.lastVoiceReply || latestAssistant;

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className={`voice-strip ${props.voiceMode || props.isListening ? "is-active" : ""}`}>
        <div className="grid gap-3 xl:grid-cols-[220px_1fr_150px]">
          <button
            className={`voice-button ${
              props.voiceMode || props.isListening
                ? "is-active"
                : ""
            }`}
            onClick={props.onMic}
            title={props.voiceMode || props.isListening ? "Stop voice mode" : "Start voice mode"}
          >
            {props.voiceMode || props.isListening ? <MicOff size={24} /> : <Mic size={24} />}
            {props.voiceMode || props.isListening ? "Listening" : "Listening off"}
          </button>
          <div className="voice-inline">
            {props.voiceMode || props.isListening ? <Waveform /> : <span className="voice-idle-dot" />}
            <span>{props.liveTranscript || props.voiceStatus}</span>
          </div>
          <button
            className="stop-button"
            onClick={props.onStopSpeaking}
            title="Stop current speech"
          >
            <VolumeX size={18} />
            Stop Audio
          </button>
        </div>
      </div>
      <div className="chat-workspace">
        <div className="manual-command">
        <p className="section-label mb-2">Manual backup</p>
        <div className="flex gap-2">
          <button
            className={`mini-mic ${
              props.isListening
                ? "is-active"
                : ""
            }`}
            onClick={props.onMic}
            title={props.isListening ? "Stop voice mode" : "Start voice mode"}
          >
            {props.isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <textarea
            className="terminal-input min-h-12 flex-1 resize-none px-4 py-3 text-sm outline-none"
            onChange={(event) => props.onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onSend();
              }
            }}
            placeholder="Type a command..."
            value={props.input}
          />
          <button
            className="send-button"
            disabled={props.isSending}
            onClick={props.onSend}
            title="Send message"
          >
            <Send size={20} />
          </button>
        </div>
        </div>
        <div className="typed-log">
          <p className="section-label mb-3">Recent typed log</p>
          <div className="space-y-2">
            {recentMessages.length === 0 && (
              <p className="text-sm text-slate-400">Typed commands will stay here. Voice turns are temporary.</p>
            )}
            {recentMessages.map((message) => (
              <div className="grid grid-cols-[72px_1fr] gap-3 text-xs" key={message.id}>
                <span className="uppercase tracking-[0.16em] text-slate-500">{message.role}</span>
                <span className="line-clamp-2 text-slate-200">{message.content}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <span className="waveform" aria-hidden="true">
      {Array.from({ length: 14 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function ContextPanel(props: {
  active: ModuleId;
  entries: TradeJournalEntry[];
  memories: Memory[];
  memoryInput: string;
  notes: WorkspaceNote[];
  onMemoryInput: (value: string) => void;
  onSaveMemory: () => void;
}) {
  return (
    <aside className="right-rail">
      <PanelTitle icon={BrainCircuit} title="Memory Core" />
      <textarea
        className="terminal-input mt-3 min-h-20 w-full resize-none p-3 text-sm outline-none"
        onChange={(event) => props.onMemoryInput(event.target.value)}
        placeholder="Save a memory..."
        value={props.memoryInput}
      />
      <button
        className="quiet-action mt-2 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm"
        onClick={props.onSaveMemory}
      >
        <Plus size={16} />
        Save memory
      </button>
      {props.memories.slice(0, 5).map((memory) => (
        <div className="flat-row" key={memory.id}>
          <p className="text-[13px] font-semibold text-[#D5DCEA]">{memory.title}</p>
          <p className="mt-1 text-[13px] leading-5 text-[#5C6880]">{memory.content}</p>
        </div>
      ))}
      <PanelTitle icon={FileText} title="Context Feed" />
      <div className="flat-row text-sm">
        <p className="text-[#5C6880]">Active project</p>
        <p className="mt-1 text-[#D5DCEA]">APEX MNQ command center</p>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Metric label="Trades" value={String(props.entries.length)} />
        <Metric label="Mode" value={props.active.toUpperCase()} />
      </div>
      {props.notes.slice(0, 4).map((note) => (
        <div className="flat-row" key={note.id}>
          <p className="section-label">{note.section}</p>
          <p className="mt-1 text-[13px] text-[#D5DCEA]">{note.title}</p>
        </div>
      ))}
    </aside>
  );
}

function TradeJournal(props: {
  entries: TradeJournalEntry[];
  setEntries: (entries: TradeJournalEntry[]) => void;
}) {
  const [form, setForm] = useState<Partial<TradeJournalEntry>>(emptyTrade);

  async function submit() {
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    props.setEntries((await res.json()).entries);
    setForm({ ...emptyTrade, date: form.date });
  }

  function upload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, screenshotDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,420px)_1fr]">
      <div className="border border-cyanline/20 bg-white/[0.03] p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
          <Field label="Market" value={form.market} onChange={(market) => setForm({ ...form, market })} />
          <Select label="Direction" value={form.direction} options={["Long", "Short", "Both"]} onChange={(direction) => setForm({ ...form, direction: direction as TradeJournalEntry["direction"] })} />
          <Field label="Result" value={form.result} onChange={(result) => setForm({ ...form, result })} />
          <Field label="Entry" value={form.entry} onChange={(entry) => setForm({ ...form, entry })} />
          <Field label="Stop" value={form.stop} onChange={(stop) => setForm({ ...form, stop })} />
          <Field label="Target" value={form.target} onChange={(target) => setForm({ ...form, target })} />
          <Field label="Points" value={form.points} onChange={(points) => setForm({ ...form, points })} />
          <Field label="Mistake tag" value={form.mistakeTag} onChange={(mistakeTag) => setForm({ ...form, mistakeTag })} />
          <Field label="Setup tag" value={form.setupTag} onChange={(setupTag) => setForm({ ...form, setupTag })} />
        </div>
        <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-slate-400">Notes</label>
        <textarea className="mt-2 min-h-28 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline" onChange={(event) => setForm({ ...form, notes: event.target.value })} value={form.notes} />
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-cyanline/30 bg-cyanline/10 px-3 py-3 text-sm text-cyanline">
          <Upload size={17} />
          Screenshot upload
          <input accept="image/*" className="hidden" type="file" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        <button className="mt-3 w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma" onClick={submit}>
          Save journal entry
        </button>
      </div>
      <div className="space-y-3">
        {props.entries.map((entry) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-white">
                {entry.date} | {entry.market} | {entry.direction}
              </p>
              <p className="text-sm text-plasma">{entry.points} pts</p>
            </div>
            <p className="mt-2 text-sm text-slate-300">{entry.notes}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="border border-cyanline/20 px-2 py-1">{entry.setupTag || "No setup tag"}</span>
              <span className="border border-warning/20 px-2 py-1">{entry.mistakeTag || "No mistake tag"}</span>
            </div>
            {entry.screenshotDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Trade screenshot" className="mt-3 max-h-48 border border-white/10 object-contain" src={entry.screenshotDataUrl} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptBuilder({ memories }: { memories: Memory[] }) {
  const [request, setRequest] = useState("");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const context = useMemo(() => memories.slice(0, 3).map((memory) => memory.title).join(", "), [memories]);

  async function build() {
    const res = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request })
    });
    setPrompt((await res.json()).prompt);
  }

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
      <div className="border border-cyanline/20 bg-white/[0.03] p-4">
        <p className="text-sm text-slate-400">Memory context: {context || "none yet"}</p>
        <textarea className="mt-4 min-h-64 w-full resize-none border border-cyanline/20 bg-void/75 p-4 text-sm outline-none focus:border-cyanline" onChange={(event) => setRequest(event.target.value)} placeholder="Describe what you want Codex to change..." value={request} />
        <button className="mt-3 w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma" onClick={build}>
          Format Codex prompt
        </button>
      </div>
      <div className="border border-cyanline/20 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold text-white">Generated prompt</p>
          <button className="flex items-center gap-2 text-sm text-cyanline" onClick={copy} disabled={!prompt}>
            <Copy size={16} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="min-h-64 whitespace-pre-wrap border border-white/10 bg-void/75 p-4 text-sm leading-6 text-slate-200">
          {prompt || "Prompt output will appear here."}
        </pre>
      </div>
    </div>
  );
}

function PineRebuildLab(props: {
  rebuilds: PineRebuild[];
  setRebuilds: (rebuilds: PineRebuild[]) => void;
  onSpeak: (text: string) => void;
}) {
  const [title, setTitle] = useState("APEX MNQ 15s process rebuild");
  const [currentScript, setCurrentScript] = useState(
    "//@version=6\nindicator(\"APEX Process Guard\", overlay=true)\n\n// Paste your current Pine Script here."
  );
  const [issueNotes, setIssueNotes] = useState(
    "Use recent Chart Watcher logs and Trade Review Notes to tighten the APEX MNQ 15 second rules. Separate setup-forming, wait-for-trigger, invalid setup, and risk-check states."
  );
  const [output, setOutput] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [copied, setCopied] = useState(false);

  async function rebuild() {
    if (!currentScript.trim() && !issueNotes.trim()) return;
    setIsRebuilding(true);
    const res = await fetch("/api/pine-rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, currentScript, issueNotes })
    });
    const data = await res.json();
    setOutput(data.output || data.error || "No Pine rebuild returned.");
    if (data.rebuilds) props.setRebuilds(data.rebuilds);
    setIsRebuilding(false);
  }

  async function copy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div className="space-y-3 border border-cyanline/20 bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyanline">
            Pine Rebuild Lab
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Paste the current Pine Script and describe the flaw. Jarvis uses recent chart
            scans and trade reviews to rebuild the logic.
          </p>
        </div>
        <Field label="Rebuild title" value={title} onChange={setTitle} />
        <label className="block text-xs uppercase tracking-[0.18em] text-slate-400">
          Current Pine Script
        </label>
        <textarea
          className="min-h-56 w-full resize-none border border-cyanline/20 bg-void/75 p-3 font-mono text-xs leading-5 outline-none focus:border-cyanline"
          onChange={(event) => setCurrentScript(event.target.value)}
          spellCheck={false}
          value={currentScript}
        />
        <label className="block text-xs uppercase tracking-[0.18em] text-slate-400">
          Flaws or requested rebuild
        </label>
        <textarea
          className="min-h-36 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline"
          onChange={(event) => setIssueNotes(event.target.value)}
          value={issueNotes}
        />
        <button
          className="w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma disabled:opacity-45"
          disabled={isRebuilding || (!currentScript.trim() && !issueNotes.trim())}
          onClick={rebuild}
        >
          {isRebuilding ? "Rebuilding Pine logic..." : "Rebuild Pine Logic"}
        </button>
      </div>
      <div className="space-y-3">
        <div className="border border-cyanline/20 bg-white/[0.03] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-white">Rebuild output</p>
            <div className="flex gap-2">
              <button
                className="border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
                disabled={!output}
                onClick={() => props.onSpeak(output)}
              >
                Speak
              </button>
              <button
                className="flex items-center gap-2 border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
                disabled={!output}
                onClick={copy}
              >
                <Copy size={15} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <pre className="min-h-80 overflow-x-auto whitespace-pre-wrap border border-white/10 bg-void/75 p-4 text-sm leading-6 text-slate-200">
            {output || "Pine rebuild output will appear here."}
          </pre>
        </div>
        {props.rebuilds.slice(0, 5).map((rebuild) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={rebuild.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-white">{rebuild.title}</p>
              <p className="text-xs text-slate-500">{new Date(rebuild.createdAt).toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm text-slate-400">{rebuild.issueNotes}</p>
            <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap border border-white/10 bg-void/75 p-3 text-xs leading-5 text-slate-300">
              {rebuild.output}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeReviewAI(props: {
  notes: WorkspaceNote[];
  onSpeak: (text: string) => void;
  setNotes: (notes: WorkspaceNote[]) => void;
}) {
  const [tradeNotes, setTradeNotes] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [review, setReview] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const existingReviews = props.notes.filter((note) => note.section === "Trade Review Notes");

  function upload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function runReview() {
    if (!tradeNotes.trim() && !imageDataUrl) return;
    setIsReviewing(true);
    setSaved(false);
    const res = await fetch("/api/trade-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: tradeNotes, imageDataUrl })
    });
    const data = await res.json();
    setReview(data.review || data.error || "No review returned.");
    setIsReviewing(false);
  }

  async function saveReview() {
    if (!review.trim()) return;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "Trade Review Notes",
        title: `AI Trade Review ${new Date().toLocaleDateString()}`,
        content: review
      })
    });
    props.setNotes((await res.json()).notes);
    setSaved(true);
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,430px)_1fr]">
      <div className="space-y-3 border border-cyanline/20 bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyanline">
            Chart Review AI
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Upload a chart screenshot and describe the entry, stop, target, result, and what
            you were thinking.
          </p>
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-cyanline/30 bg-cyanline/10 px-3 py-4 text-sm text-cyanline">
          <Upload size={17} />
          Upload chart screenshot
          <input accept="image/*" className="hidden" type="file" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        {imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Chart screenshot preview" className="max-h-56 w-full border border-white/10 object-contain" src={imageDataUrl} />
        )}
        <textarea
          className="min-h-52 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline"
          onChange={(event) => setTradeNotes(event.target.value)}
          placeholder="Example: MNQ long, 15 second APEX setup, entered after confirmation, stop under structure, target 16 points..."
          value={tradeNotes}
        />
        <button
          className="w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma disabled:opacity-45"
          disabled={isReviewing || (!tradeNotes.trim() && !imageDataUrl)}
          onClick={runReview}
        >
          {isReviewing ? "Reviewing..." : "Analyze Trade"}
        </button>
      </div>
      <div className="space-y-3">
        <div className="border border-cyanline/20 bg-white/[0.03] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-white">AI review output</p>
            <div className="flex gap-2">
              <button
                className="border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
                disabled={!review}
                onClick={() => props.onSpeak(review)}
              >
                Speak review
              </button>
              <button
                className="border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
                disabled={!review}
                onClick={saveReview}
              >
                {saved ? "Saved" : "Save review note"}
              </button>
            </div>
          </div>
          <pre className="min-h-72 whitespace-pre-wrap border border-white/10 bg-void/75 p-4 text-sm leading-6 text-slate-200">
            {review || "Trade review will appear here."}
          </pre>
        </div>
        {existingReviews.slice(0, 3).map((note) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={note.id}>
            <p className="font-semibold text-white">{note.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const statusStyles: Record<ChartWatchLog["status"], string> = {
  NO_TRADE: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  SETUP_FORMING: "border-cyanline/40 bg-cyanline/10 text-cyanline",
  WAIT_FOR_TRIGGER: "border-plasma/40 bg-plasma/10 text-plasma",
  INVALID_SETUP: "border-warning/40 bg-warning/10 text-warning",
  RISK_CHECK_REQUIRED: "border-rose-300/40 bg-rose-300/10 text-rose-200"
};

function ChartWatcher(props: {
  logs: ChartWatchLog[];
  setLogs: (logs: ChartWatchLog[]) => void;
  onSpeak: (text: string) => void;
}) {
  const [notes, setNotes] = useState("MNQ 15 second APEX chart. Classify the setup state and risk.");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [result, setResult] = useState<{
    status: ChartWatchLog["status"];
    summary: string;
    analysis: string;
    checklist: string[];
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  function upload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function scanChart() {
    if (!notes.trim() && !imageDataUrl) return;
    setIsScanning(true);
    const res = await fetch("/api/chart-watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, imageDataUrl })
    });
    const data = await res.json();
    if (data.result) {
      setResult(data.result);
      props.setLogs(data.logs || []);
      props.onSpeak(`${data.result.status.replaceAll("_", " ")}. ${data.result.summary}`);
    }
    setIsScanning(false);
  }

  const activeResult = result || props.logs[0] || null;

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,430px)_1fr]">
      <div className="space-y-3 border border-cyanline/20 bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyanline">
            APEX Chart Watcher v1
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Upload the current chart. Jarvis classifies the setup state, speaks the readout,
            and saves a chart-watch log.
          </p>
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-cyanline/30 bg-cyanline/10 px-3 py-4 text-sm text-cyanline">
          <Upload size={17} />
          Upload current chart
          <input accept="image/*" className="hidden" type="file" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        {imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Current chart preview" className="max-h-56 w-full border border-white/10 object-contain" src={imageDataUrl} />
        )}
        <textarea
          className="min-h-40 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline"
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
        <button
          className="w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma disabled:opacity-45"
          disabled={isScanning || (!notes.trim() && !imageDataUrl)}
          onClick={scanChart}
        >
          {isScanning ? "Scanning chart..." : "Analyze Current Chart"}
        </button>
      </div>
      <div className="space-y-3">
        <div className="border border-cyanline/20 bg-white/[0.03] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-white">Current chart read</p>
            <button
              className="border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
              disabled={!activeResult}
              onClick={() => activeResult && props.onSpeak(`${activeResult.status.replaceAll("_", " ")}. ${activeResult.summary}`)}
            >
              Speak status
            </button>
          </div>
          {activeResult ? (
            <div className="space-y-3">
              <div className={`inline-flex border px-3 py-2 text-sm font-semibold ${statusStyles[activeResult.status]}`}>
                {activeResult.status.replaceAll("_", " ")}
              </div>
              <p className="text-lg font-semibold text-white">{activeResult.summary}</p>
              <pre className="whitespace-pre-wrap border border-white/10 bg-void/75 p-4 text-sm leading-6 text-slate-200">
                {activeResult.analysis}
              </pre>
              {"checklist" in activeResult && Array.isArray(activeResult.checklist) && (
                <div className="border border-white/10 bg-white/[0.03] p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-cyanline">
                    Next checks
                  </p>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {activeResult.checklist.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="border border-white/10 bg-void/75 p-4 text-sm text-slate-400">
              Chart status will appear here after the first scan.
            </p>
          )}
        </div>
        {props.logs.slice(0, 5).map((log) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={log.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`border px-2 py-1 text-xs font-semibold ${statusStyles[log.status]}`}>
                {log.status.replaceAll("_", " ")}
              </span>
              <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{log.summary}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{log.analysis}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const agentCards = [
  {
    id: "architect",
    name: "System Architect",
    brief: "Turns big Jarvis ideas into modules, screens, data flows, and build phases."
  },
  {
    id: "logic",
    name: "Logic Manager",
    brief: "Converts discretionary trading ideas into rules, states, and test scenarios."
  },
  {
    id: "risk",
    name: "Risk Guardian",
    brief: "Builds lockouts, risk checks, and revenge-trade protection logic."
  },
  {
    id: "chart",
    name: "Chart Watcher",
    brief: "Designs what Jarvis should watch for on chart screenshots or live capture."
  },
  {
    id: "codex",
    name: "Codex Builder",
    brief: "Creates implementation-ready prompts for the next coding pass."
  }
];

function SystemAgents(props: {
  runs: AgentRun[];
  setRuns: (runs: AgentRun[]) => void;
  onSpeak: (text: string) => void;
}) {
  const [agentId, setAgentId] = useState("architect");
  const [request, setRequest] = useState(
    "Design the next structural build for Jarvis around APEX chart watching, trade review, and risk logic."
  );
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const selectedAgent = agentCards.find((agent) => agent.id === agentId) || agentCards[0];

  async function runAgent() {
    if (!request.trim()) return;
    setIsRunning(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, request })
    });
    const data = await res.json();
    setOutput(data.output || data.error || "No agent output returned.");
    if (data.runs) props.setRuns(data.runs);
    setIsRunning(false);
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,430px)_1fr]">
      <div className="space-y-3 border border-cyanline/20 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyanline">
          Agent Command Center
        </p>
        <div className="grid gap-2">
          {agentCards.map((agent) => {
            const active = agent.id === agentId;
            return (
              <button
                className={`border p-3 text-left transition ${
                  active
                    ? "border-cyanline/70 bg-cyanline/15"
                    : "border-white/10 bg-white/[0.03] hover:border-cyanline/40"
                }`}
                key={agent.id}
                onClick={() => setAgentId(agent.id)}
              >
                <p className="text-sm font-semibold text-white">{agent.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{agent.brief}</p>
              </button>
            );
          })}
        </div>
        <textarea
          className="min-h-44 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline"
          onChange={(event) => setRequest(event.target.value)}
          value={request}
        />
        <button
          className="w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma disabled:opacity-45"
          disabled={isRunning || !request.trim()}
          onClick={runAgent}
        >
          {isRunning ? `Running ${selectedAgent.name}...` : `Run ${selectedAgent.name}`}
        </button>
      </div>
      <div className="space-y-3">
        <div className="border border-cyanline/20 bg-white/[0.03] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-white">{selectedAgent.name} output</p>
            <button
              className="border border-cyanline/30 bg-cyanline/10 px-3 py-2 text-sm text-cyanline disabled:opacity-45"
              disabled={!output}
              onClick={() => props.onSpeak(output)}
            >
              Speak output
            </button>
          </div>
          <pre className="min-h-72 whitespace-pre-wrap border border-white/10 bg-void/75 p-4 text-sm leading-6 text-slate-200">
            {output || "Agent output will appear here."}
          </pre>
        </div>
        {props.runs.slice(0, 5).map((run) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={run.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-white">{run.agentName}</p>
              <p className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm text-slate-400">{run.input}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {run.output}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesModule(props: {
  notes: WorkspaceNote[];
  section: string;
  setNotes: (notes: WorkspaceNote[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const sectionNotes = props.notes.filter((note) => note.section === props.section);

  async function save() {
    if (!content.trim()) return;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: props.section, title: title || "Untitled note", content })
    });
    props.setNotes((await res.json()).notes);
    setTitle("");
    setContent("");
  }

  return (
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="border border-cyanline/20 bg-white/[0.03] p-4">
        <Field label="Title" value={title} onChange={setTitle} />
        <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-slate-400">Note</label>
        <textarea className="mt-2 min-h-64 w-full resize-none border border-cyanline/20 bg-void/75 p-3 text-sm outline-none focus:border-cyanline" onChange={(event) => setContent(event.target.value)} value={content} />
        <button className="mt-3 w-full border border-plasma/40 bg-plasma/15 px-3 py-3 text-plasma" onClick={save}>
          Save note
        </button>
      </div>
      <div className="space-y-3">
        {sectionNotes.map((note) => (
          <div className="border border-white/10 bg-white/[0.03] p-4" key={note.id}>
            <p className="font-semibold text-white">{note.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="section-label mt-6 flex items-center gap-2 first:mt-0">
      <Icon size={16} />
      {title}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flat-metric">
      <p className="section-label">{label}</p>
      <p className="mt-1 truncate font-data text-[16px] text-[#D5DCEA]">{value}</p>
    </div>
  );
}

function Field(props: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{props.label}</span>
      <input className="mt-2 h-11 w-full border border-cyanline/20 bg-void/75 px-3 text-sm outline-none focus:border-cyanline" onChange={(event) => props.onChange(event.target.value)} type={props.type || "text"} value={props.value || ""} />
    </label>
  );
}

function Select(props: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{props.label}</span>
      <select className="mt-2 h-11 w-full border border-cyanline/20 bg-void/75 px-3 text-sm outline-none focus:border-cyanline" onChange={(event) => props.onChange(event.target.value)} value={props.value || ""}>
        {props.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
