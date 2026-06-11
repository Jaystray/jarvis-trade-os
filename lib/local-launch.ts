import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LocalLaunchTarget = {
  id: string;
  label: string;
  type: "app" | "url";
  target: string;
};

export type LocalLaunchResult = {
  enabled: boolean;
  launched: boolean;
  message: string;
  target?: LocalLaunchTarget;
};

function env(name: string) {
  return process.env[name]?.trim();
}

function localLaunchEnabled() {
  if (env("JARVIS_ENABLE_LOCAL_LAUNCH") === "false") return false;
  return env("JARVIS_ENABLE_LOCAL_LAUNCH") === "true" || process.env.NODE_ENV === "development";
}

export function getLaunchTargets(): LocalLaunchTarget[] {
  return [
    {
      id: "tradingview",
      label: "TradingView",
      type: env("JARVIS_TRADINGVIEW_APP") ? "app" : "url",
      target: env("JARVIS_TRADINGVIEW_APP") || env("JARVIS_TRADINGVIEW_URL") || "https://www.tradingview.com/chart/"
    },
    {
      id: "mnq",
      label: "MNQ Chart",
      type: "url",
      target:
        env("JARVIS_MNQ_URL") ||
        "https://www.tradingview.com/chart/?symbol=CME_MINI%3AMNQ1%21"
    },
    {
      id: "nq",
      label: "NQ Chart",
      type: "url",
      target:
        env("JARVIS_NQ_URL") ||
        "https://www.tradingview.com/chart/?symbol=CME_MINI%3ANQ1%21"
    }
  ];
}

export function detectLaunchIntent(input: string) {
  const text = input.toLowerCase();
  const wantsOpen = /\b(open|launch|pull up|bring up|show me|load)\b/.test(text);
  if (!wantsOpen) return null;

  if (/\b(mnq|micro nasdaq)\b/.test(text)) return "mnq";
  if (/\b(nq|nasdaq futures)\b/.test(text)) return "nq";
  if (/\b(tradingview|trading view)\b/.test(text)) return "tradingview";
  return null;
}

export async function launchLocalTarget(targetId: string): Promise<LocalLaunchResult> {
  if (process.platform !== "darwin") {
    return {
      enabled: false,
      launched: false,
      message: "Local app launch is only available on your Mac, not on hosted servers like Railway."
    };
  }

  if (!localLaunchEnabled()) {
    return {
      enabled: false,
      launched: false,
      message: "Local app launch is disabled. Set JARVIS_ENABLE_LOCAL_LAUNCH=true in .env to enable it."
    };
  }

  const target = getLaunchTargets().find((item) => item.id === targetId);
  if (!target) {
    return {
      enabled: true,
      launched: false,
      message: "That launcher target is not on the Jarvis allowlist."
    };
  }

  if (target.type === "app") {
    await execFileAsync("open", ["-a", target.target]);
  } else {
    await execFileAsync("open", [target.target]);
  }

  return {
    enabled: true,
    launched: true,
    message: `Opening ${target.label}.`,
    target
  };
}
