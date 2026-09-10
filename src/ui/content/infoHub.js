export const infoHubContent = {
  whatIsThis: {
    id: 'what-is-this',
    title: 'What is this?',
    icon: 'map',
    content: `
      <p>WikiRealms turns a Wikipedia article's structure into an explorable landscape.</p>
      <div class="info-hub__features">
        <div class="info-hub__feature"><strong>Section peaks:</strong> top-level sections form mountain ranges; their subsections form smaller peaks within them.</div>
        <div class="info-hub__feature"><strong>Peak size:</strong> a section's own text makes its peak taller, while its full subtree makes the surrounding range broader.</div>
        <div class="info-hub__feature"><strong>Water:</strong> short articles have a higher sea level and less exposed land. Longer, more detailed articles lower the sea level and reveal more terrain.</div>
        <div class="info-hub__feature"><strong>Portals:</strong> each distinct outbound Wikipedia link becomes a route to another article's world.</div>
      </div>
      <p>Search for any English Wikipedia article to generate its world.</p>
      <p>To see what the colours and markers of a world mean, open the legend from
      <em>Legend</em> beside the view controls, from <em>What am I looking at?</em>
      in the Ledger, or press <kbd>L</kbd>.</p>
    `,
  },
  howItWorks: {
    id: 'how-it-works',
    title: 'How it works',
    icon: 'layers',
    content: `
      <h3>How a world is formed</h3>
      <ol>
        <li><strong>Read the outline:</strong> the article's section tree is turned into a nested set of peaks. Top-level sections are separate mountain systems; child sections layer smaller summits on their parent range.</li>
        <li><strong>Scale the terrain:</strong> each section's own prose controls its peak height. The total text in that section and its descendants controls the peak's radius.</li>
        <li><strong>Add natural detail:</strong> seeded fractal noise roughens the structural terrain, so the same article always produces the same world while still looking organic.</li>
        <li><strong>Set sea level:</strong> total article length shifts the effective waterline. Stub-like articles sit lower beneath the water; detailed articles expose more land.</li>
        <li><strong>Paint the ground:</strong> elevation decides where the sea and the shore are. Everything above the shore is how well that section cites, compared against the article it belongs to: bare dunes for a section with no references at all, then dry ground, meadow, woodland and closed canopy as a section's citations per sentence rise above the article's own rate. An article that cites little stays dry throughout, however uneven it is.</li>
        <li><strong>Weather the heights:</strong> rock and then snow come in gradually over the high ground, on top of whatever colour it already had rather than instead of it. So a well-sourced section's peak is damp, mossy stone and a poorly-sourced one's is dry scree, and trees climb further up the better-sourced range before giving out.</li>
      </ol>
      <h3>Portals and navigation</h3>
      <p>Every distinct outbound link in the article's lead or sections can become a portal. Portals from a section are placed within that section's top-level mountain range; repeated links within one section are combined, while the same destination can appear in different ranges.</p>
      <p>Choose a portal to travel to its article, then use the back and forward controls or arrow keys to retrace your route.</p>
    `,
  },
  about: {
    id: 'about',
    title: 'About',
    icon: 'mark',
    content: `
      <h3>Created by Moriel Schottlender</h3>
      <p>WikiRealms explores knowledge networks through procedural worlds and game design.</p>
      <p>It asks the question: What would a Wikipedia article look like if it were a physical place you could explore? How would an article be represented through geography?</p>
      <p>Now you can explore Wikipedia articles as landscapes, where each section is a peak and every link is a portal to another world.</p>
      <ul>
        <li><a href="https://github.com/mooeypoo/WikiRealms" target="_blank" rel="noopener noreferrer">Source code</a></li>
        <li><a href="https://moriel.tech" target="_blank" rel="noopener noreferrer">Personal website</a></li>
      </ul>
      <h3>Credits</h3>
      <p>
        Animal models are
        <a href="https://kenney.nl/assets/cube-pets" target="_blank" rel="noopener noreferrer">Cube Pets</a>
        by <a href="https://kenney.nl" target="_blank" rel="noopener noreferrer">Kenney</a>
        (Creative Commons CC0). Portal fountains use pieces from
        <a href="https://kenney.nl/assets/fantasy-town-kit" target="_blank" rel="noopener noreferrer">Fantasy Town Kit</a>
        (also CC0).
      </p>
    `,
  },
  shortcuts: {
    id: 'shortcuts',
    title: 'Keyboard',
    icon: 'legend',
    content: `
      <p data-shortcuts>Every shortcut the app has registered, listed below.</p>
    `,
  },
}

export const infoTabs = Object.values(infoHubContent)
