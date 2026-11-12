export async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new Error("Request aborted"));
    };
    if (outer?.aborted) abort();
    else outer?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, milliseconds);
  });
  try {
    return await Promise.race([work(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}
