// median, 95th percentile and maximum of a list of milliseconds
export default function summary (samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] }
}
