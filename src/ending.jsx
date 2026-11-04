import { Link } from "react-router-dom";
import Typewriter from "./typewriter";

export default function Ending() {
  return (
    <main>
      <title>hello — context window</title>
      <h1>~ $</h1>
      <Typewriter text="Hello! How can I help you today?"></Typewriter>
      <footer>
        <Link to="/">new conversation</Link>
      </footer>
    </main>
  );
}
