// Editor markup, ported from reference/trip-mindmap.html by scripts/port-editor.py.
export const MARKUP = `
<div class="app">
  <main>
    <div class="bar">
      <input id="title" aria-label="File name" autocomplete="off" title="Rename the file">
      <label class="toggle trip" title="Calendar (Ctrl+K)"><input type="checkbox" id="calToggle"><span class="sw"></span>Calendar</label>
      <div class="seg trip" id="modes" hidden>
        <button type="button" data-mode="a"><b>1</b><span class="long">Timeline</span></button>
        <button type="button" data-mode="b"><b>2</b><span class="long">Map on dates</span></button>
        <button type="button" data-mode="c"><b>3</b><span class="long">Strip</span></button>
      </div>
      <button class="btn" id="agentBtn" type="button" title="Ask AI for ideas or changes (/)">Ask AI</button>
      <button class="btn trip" id="routeBtn" type="button" aria-pressed="false" title="Route map (R)">Route map</button>
      <button class="btn" id="helpBtn" type="button" title="Keyboard shortcuts">?</button>
    </div>
    <div class="insp" id="insp"></div>
    <div class="stage" id="stage">
      <section class="pane mapPane" id="mapPane" tabindex="0" aria-label="Mind map">
        <svg id="mapSvg"><g id="vp"></g></svg>
        <div class="zoom"><button type="button" id="zSnap" class="wide" title="Tidy the map, keeping the order you dragged ideas into (dated ideas stay in date order)">Snap</button><button type="button" id="zSide" class="wide" title="Lay ideas out on one side or both sides of the centre">Both sides</button><button type="button" id="zOut" aria-label="Zoom out">−</button><button type="button" id="zFit" aria-label="Fit map">⤢</button><button type="button" id="zIn" aria-label="Zoom in">+</button></div>
        <div class="acts-bar" id="actsBar" hidden>
          <button type="button" data-act="child">+ Child<kbd>Tab</kbd></button>
          <button type="button" data-act="sib">+ Sibling<kbd>⇧↵</kbd></button>
          <button type="button" class="trip" data-act="nextadd">+ Next stop<kbd>Ctrl ↵</kbd></button>
          <button type="button" data-act="edit">Rename<kbd>↵</kbd></button>
          <button type="button" class="trip" data-act="dates">Dates<kbd>Ctrl D</kbd></button>
          <button type="button" data-act="del">Delete<kbd>⇧Del</kbd></button>
        </div>
        <input id="nodeEdit" hidden autocomplete="off" aria-label="Idea text">
      </section>
      <section class="pane calPane" id="calPane" hidden>
        <div class="calHead"><span id="calTitle"></span><span id="calSpan"></span></div>
        <div id="calScroll"><svg id="calSvg"></svg></div>
        <div id="tray" hidden></div>
      </section>
      <svg id="threads"></svg>
      <section id="agent" class="agent" hidden aria-label="Ask AI">
        <div class="ag-head"><strong>Ask AI</strong><span class="spacer"></span><button class="btn" type="button" id="agClose" aria-label="Close Ask AI">✕</button></div>
        <div id="agLog" class="ag-log" aria-live="polite"></div>
        <div id="agProposal" class="ag-prop" hidden></div>
        <form id="agForm"><textarea id="agIn" rows="2" placeholder="Ask for ideas or changes, e.g. “plan 4 days in Kyoto in spring”"></textarea>
          <div class="ag-row"><span id="agStatus"></span><button type="button" class="btn" id="agStop" hidden>Stop</button><button type="submit" class="btn primary" id="agSend">Send</button></div></form>
      </section>
    </div>
  </main>
  <aside id="route" class="trip" hidden aria-label="Route map">
    <div class="r-head"><strong>Route</strong><span class="spacer"></span><button class="btn" type="button" id="routeReplay">▶ Replay</button><button class="btn" type="button" id="routeFull">Full screen</button><button class="btn" type="button" id="routeClose" aria-label="Close route map">✕</button></div>
    <div id="routeMapWrap"><svg id="routeSvg"></svg><p id="routeMsg" hidden></p></div>
    <div id="routeLegs"></div>
  </aside>
</div>
<datalist id="placeList"></datalist>
<div id="ctx" hidden></div>
<div id="help" hidden><div class="card" role="dialog" aria-label="Keyboard shortcuts">
  <h2>Shortcuts</h2>
  <table>
    <tr><td><kbd class="k">Tab</kbd></td><td>New child idea</td></tr>
    <tr><td><kbd class="k">Shift</kbd> + <kbd class="k">Enter</kbd></td><td>New sibling idea</td></tr>
    <tr class="trip"><td><kbd class="k">Ctrl</kbd> + <kbd class="k">Enter</kbd></td><td>Add the next stop of the trip (arrow)</td></tr>
    <tr class="trip"><td><kbd class="k">N</kbd></td><td>Make the idea its parent's next stop, or a regular idea again</td></tr>
    <tr><td><kbd class="k">Shift</kbd> + <kbd class="k">Delete</kbd></td><td>Delete idea and its branch</td></tr>
    <tr><td><kbd class="k">Enter</kbd> or <kbd class="k">F2</kbd></td><td>Rename (Enter again to finish)</td></tr>
    <tr><td><kbd class="k">Esc</kbd></td><td>Stop editing / clear selection</td></tr>
    <tr><td>Arrow keys</td><td>Move selection</td></tr>
    <tr><td><kbd class="k">Alt</kbd> + <kbd class="k">↑</kbd> / <kbd class="k">↓</kbd></td><td>Reorder among siblings</td></tr>
    <tr class="trip"><td><kbd class="k">Ctrl</kbd> + <kbd class="k">D</kbd></td><td>Set dates</td></tr>
    <tr><td><kbd class="k">Ctrl</kbd> + <kbd class="k">E</kbd></td><td>Notes for the selected idea (Esc to return to the map)</td></tr>
    <tr class="trip"><td><kbd class="k">M</kbd></td><td>Maybe (dashed) / committed</td></tr>
    <tr class="trip"><td><kbd class="k">F</kbd></td><td>Fixed booking (red line on the calendar)</td></tr>
    <tr><td><kbd class="k">C</kbd> then <kbd class="k">1</kbd>–<kbd class="k">8</kbd></td><td>Colour the idea and its branch (<kbd class="k">0</kbd> = automatic colour)</td></tr>
    <tr><td><kbd class="k">Space</kbd></td><td>Collapse / expand branch</td></tr>
    <tr><td><kbd class="k">Ctrl</kbd> + <kbd class="k">Z</kbd> / <kbd class="k">Ctrl</kbd> + <kbd class="k">Shift</kbd> + <kbd class="k">Z</kbd></td><td>Undo / redo</td></tr>
    <tr class="trip"><td><kbd class="k">Ctrl</kbd> + <kbd class="k">K</kbd></td><td>Calendar on / off</td></tr>
    <tr class="trip"><td><kbd class="k">1</kbd> <kbd class="k">2</kbd> <kbd class="k">3</kbd></td><td>Timeline / Map on dates / Strip</td></tr>
    <tr class="trip"><td><kbd class="k">R</kbd></td><td>Route map on / off</td></tr>
    <tr><td><kbd class="k">/</kbd></td><td>Ask AI for ideas or changes</td></tr>
    <tr><td>Mouse</td><td>Drop an idea onto another to make it a child. Drop it anywhere else to place it freely; Snap then tidies the map in the order you arranged.<span class="trip"> Ideas with dates always sort by date.</span> Drag empty space to pan, Ctrl + scroll to zoom. Double-click empty space for a new main branch.<span class="trip"> Drag calendar bars to move them, drag their ends to change dates.</span></td></tr>
  </table>
  <p style="margin:14px 0 0;text-align:right"><button class="btn" type="button" id="helpX">Close</button></p>
</div></div>
`;
