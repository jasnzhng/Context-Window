import Typewriter from "./typewriter";

export default function Opening({ page }) {
  function handleSubmit(event) {
    event.preventDefault();
    // Nothing reads this yet: the rooms were baked from the artist's own answer.
    sessionStorage.setItem("answer", event.target.answer.value);
    window.location.href = "room-01.html";
  }

  return (
    <main>
      <h1>~ $ ./context-window</h1>
      <Typewriter text={page.question}></Typewriter>
      <form onSubmit={handleSubmit}>
        &gt; <input name="answer" autoComplete="off" aria-label="your answer" />{" "}
        <button className="obj">[enter]</button>
      </form>
    </main>
  );
}
