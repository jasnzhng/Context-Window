// The visitor's answer and every room so far, kept for this browser tab.
export function loadVisit() {
  return JSON.parse(sessionStorage.getItem("visit"));
}

export function saveVisit(visit) {
  sessionStorage.setItem("visit", JSON.stringify(visit));
}
