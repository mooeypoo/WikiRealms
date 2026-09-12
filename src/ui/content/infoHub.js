export const infoHubContent = {
  startHere: {
    id: 'start-here',
    titleKey: 'wikirealms-info-tab-start',
    icon: 'map',
    content: `
      <p>WikiRealms turns a Wikipedia article into a place you can explore.</p>
      <ul class="info-hub__bullets">
        <li><strong>Peaks</strong> are sections. Taller means more of that section's own text; broader means a larger subsection tree.</li>
        <li><strong>Water</strong> rises on short articles and falls as the article grows — stubs flood; detailed pages expose more land.</li>
        <li><strong>Fish</strong> are pageviews. Quieter articles stay sparse; heavily read ones fill the seas (hover a fish to see the count).</li>
        <li><strong>Portals</strong> are outbound Wikipedia links. Step through one to travel to another article's world.</li>
        <li><strong>Your trail</strong> remembers the path you walked. Open it from the top bar; share a realm or the whole trail from Share.</li>
      </ul>
      <p class="info-hub__callout">Open <em>Legend</em> beside the view controls (or press <kbd>L</kbd>) to see what the colours and markers mean.</p>
    `,
  },
  journey: {
    id: 'journey',
    titleKey: 'wikirealms-info-tab-journey',
    icon: 'trail',
    content: `
      <p>Every portal you take is kept on your trail — a map of the part of Wikipedia you have walked.</p>
      <ul class="info-hub__bullets">
        <li>Use back and forward (or the arrow keys) to retrace steps without losing the branch you came from.</li>
        <li>Open <em>Your trail</em> in the top bar to jump to any stop you have already visited.</li>
        <li><em>Share this realm</em> sends a link to the world underfoot. <em>Share my trail</em> makes a postcard of the path.</li>
      </ul>
    `,
  },
  howWorlds: {
    id: 'how-worlds',
    titleKey: 'wikirealms-info-tab-how-worlds',
    icon: 'layers',
    content: `
      <p>Each world is generated from the article's outline, prose length, and citations — the same article always produces the same place.</p>
      <details class="info-hub__details">
        <summary>How a world is built</summary>
        <ol>
          <li><strong>Read the outline:</strong> the section tree becomes nested peaks. Top-level sections are separate mountain systems.</li>
          <li><strong>Scale the terrain:</strong> a section's own prose sets peak height; its full subtree sets how broad the range is.</li>
          <li><strong>Add natural detail:</strong> seeded noise roughens the structure so the map looks organic without changing between visits.</li>
          <li><strong>Set sea level:</strong> total article length shifts the waterline. Stubs sit lower under water; detailed articles expose more land.</li>
          <li><strong>Paint the ground:</strong> above the shore, citation density vs the article's own rate decides bare dunes through closed canopy.</li>
          <li><strong>Weather the heights:</strong> rock and snow layer over high ground on top of that colour, so well-sourced peaks read damp and mossy.</li>
        </ol>
      </details>
      <p>Portals from a section sit in that section's top-level range. Repeated links in one section combine; the same destination can appear in different ranges.</p>
    `,
  },
  about: {
    id: 'about',
    titleKey: 'wikirealms-info-tab-about',
    icon: 'mark',
    content: `
      <p>Created by <strong>Moriel Schottlender</strong> — an experiment in seeing knowledge networks as places.</p>
      <p>What would a Wikipedia article look like as a landscape you could walk? Barren slopes and flooded maps are invitations to grow the public record; citations and prose still live on Wikipedia.</p>
      <ul class="info-hub__links">
        <li><a href="https://github.com/mooeypoo/WikiRealms" target="_blank" rel="noopener noreferrer">Source code</a></li>
        <li><a href="https://moriel.tech" target="_blank" rel="noopener noreferrer">moriel.tech</a></li>
      </ul>
      <h3>Credits</h3>
      <p>
        Fish models from the
        <a href="https://quaternius.com" target="_blank" rel="noopener noreferrer">Cute Fish Pack</a>
        by <a href="https://www.patreon.com/quaternius" target="_blank" rel="noopener noreferrer">Quaternius</a>
        (CC0). Portal fountains use
        <a href="https://kenney.nl/assets/fantasy-town-kit" target="_blank" rel="noopener noreferrer">Fantasy Town Kit</a>
        by <a href="https://kenney.nl" target="_blank" rel="noopener noreferrer">Kenney</a>
        (CC0).
      </p>
    `,
  },
  shortcuts: {
    id: 'shortcuts',
    titleKey: 'wikirealms-info-tab-keyboard',
    icon: 'legend',
    content: `
      <p data-shortcuts>Every shortcut the app has registered, listed below.</p>
    `,
  },
}

export const infoTabs = Object.values(infoHubContent)
