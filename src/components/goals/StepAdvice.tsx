import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { weakestStepAdvice } from "@/lib/stepAdvice.functions";
import { istToday } from "@/lib/goals";

/** Monday of the current IST week — the cache key, so this refreshes weekly. */
export function weekStart(today = istToday()): string {
  const d = new Date(`${today}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/** One practical line under the weakest funnel step. Silent if AI is unavailable. */
export function StepAdvice({ goalId, big }: { goalId: string; big?: boolean }) {
  const ask = useServerFn(weakestStepAdvice);
  const { data } = useQuery({
    queryKey: ["step-advice", goalId, weekStart()],
    retry: false,
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: async () => ask({ data: { goalId, weekStart: weekStart() } }),
  });

  if (!data?.advice) return null;

  return (
    <p
      className={`mt-2 leading-relaxed text-soft ${big ? "text-[15px]" : "text-[13px]"}`}
    >
      <span className="font-bold text-ink">Try this tomorrow.</span> {data.advice}
    </p>
  );
}
