import { useNavigate } from "react-router-dom";
import Typewriter from "./typewriter";
import { saveVisit } from "./visit";
import config from "../config.json";

export default function Opening() {
  const navigate = useNavigate();

  // A new answer starts a new walk through the house.
  function handleSubmit(event) {
    event.preventDefault();
    saveVisit({ answer: event.target.answer.value, rooms: [] });
    navigate("/room/1");
  }

  return (
    <main>
      <title>context window</title>
      <h1>~ $ ./context-window</h1>
      <Typewriter text={config.question}></Typewriter>
      <form onSubmit={handleSubmit}>
        &gt;{" "}
        <input
          name="answer"
          autoComplete="off"
          aria-label="your answer"
          required
        />{" "}
        <button className="obj">[enter]</button>
      </form>
    </main>
  );
}
