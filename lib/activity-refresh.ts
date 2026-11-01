// MongoDB reads are request based. Keep open activity views in sync with
// changes made by other users without reloading the whole page.
export function startActivityRefresh(refresh: () => Promise<unknown>) {
  let refreshing = false;
  let disposed = false;

  const update = async () => {
    if (disposed || refreshing || document.visibilityState === "hidden") return;
    refreshing = true;
    try {
      await refresh();
    } catch (error) {
      console.error("Unable to refresh activities:", error);
    } finally {
      refreshing = false;
    }
  };

  const timer = window.setInterval(update, 15000);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);

  return () => {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener("focus", update);
    document.removeEventListener("visibilitychange", update);
  };
}
