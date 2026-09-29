/**
 * App shell only. The local world (/world/local) replaces this in the WorldStage slice;
 * the web app renders primitive state and submits actions but never computes science.
 */
export function App() {
  return (
    <main>
      <h1>PaperPlay</h1>
      <p>A research paper you can play with. The first world, a flock you can touch, is being built.</p>
    </main>
  );
}
