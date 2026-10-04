"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, saveSettings } from "./settings";
import type { Settings } from "./types";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings().then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, update };
}

/** 简易异步数据加载：deps 变化或 reload() 时重新执行 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef
      .current()
      .then((value) => {
        if (alive) setData(value);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, reload, setData };
}

