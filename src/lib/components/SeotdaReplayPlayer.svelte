<script>
  import { onDestroy, onMount } from 'svelte';
  import HwatuCardFace from '../../routes/games/seotda/HwatuCardFace.svelte';

  /** @typedef {{ type: string; seatId: string | null; text: string; amount: number; potAfter: number }} ReplayEvent */
  /** @typedef {{ id: string; name: string; chips: number; folded: boolean; winner: boolean; handName: string; cards: Array<{ month: number; gwang: boolean }> }} ReplaySeat */
  let { replay } = $props();
  const game = $derived(replay?.data ?? replay ?? null);
  const seats = $derived(Array.isArray(game?.seats) ? game.seats : []);
  const events = $derived(Array.isArray(game?.events) ? game.events : []);
  const npcSeats = $derived(
    seats.filter(/** @param {ReplaySeat} seat */ (seat) => seat.id !== 'user')
  );
  let step = $state(0);
  let playing = $state(false);
  let timer = 0;

  const currentEvent = $derived(events[Math.min(step, Math.max(0, events.length - 1))] ?? null);
  const showdownIndex = $derived(
    Math.max(
      0,
      events.findIndex(/** @param {ReplayEvent} event */ (event) => event.type === 'showdown')
    )
  );
  const cardsRevealed = $derived(step >= showdownIndex);
  const resultVisible = $derived(currentEvent?.type === 'result');
  const ddaengVisible = $derived(
    Boolean(game?.ddaeng) &&
      (currentEvent?.type === 'ddaeng' ||
        events.findIndex(/** @param {ReplayEvent} event */ (event) => event.type === 'ddaeng') <
          step)
  );
  const progress = $derived(events.length > 1 ? (step / (events.length - 1)) * 100 : 0);

  /** @param {unknown} value */
  function formatNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  }

  /** @param {ReplayEvent | null | undefined} event */
  function eventDelay(event) {
    if (event?.type === 'showdown' || event?.type === 'ddaeng' || event?.type === 'result') {
      return 1500;
    }
    if (event?.type === 'taunt') {
      return Math.min(6000, Math.max(3200, String(event.text ?? '').length * 95));
    }
    return 950;
  }

  /** @param {string} seatId */
  function hasFoldedAtCurrentStep(seatId) {
    return events
      .slice(0, step + 1)
      .some(
        /** @param {ReplayEvent} event */ (event) =>
          event.seatId === seatId && event.type === 'action' && event.text.includes('다이')
      );
  }

  /** @param {ReplayEvent | null | undefined} event */
  function actionLabel(event) {
    if (!event || event.type !== 'action') return '';
    if (event.text.includes('다이')) return '다이';
    if (event.text.includes('레이즈')) return '레이즈';
    if (event.text.includes('올인')) return '올인';
    if (event.text.includes('콜')) return '콜';
    if (event.text.includes('체크')) return '체크';
    return '';
  }

  /** @param {string | null | undefined} seatId */
  function chipOriginStyle(seatId) {
    if (seatId === 'user') return '--chip-x: 50%; --chip-y: 82%;';
    const index = npcSeats.findIndex(/** @param {ReplaySeat} seat */ (seat) => seat.id === seatId);
    const x = index < 0 ? 50 : ((index + 0.5) / Math.max(1, npcSeats.length)) * 100;
    return `--chip-x: ${x}%; --chip-y: 24%;`;
  }

  /** @param {ReplayEvent | null | undefined} event */
  function sendsChips(event) {
    return (
      event?.type === 'action' && Number(event.amount) > 0 && /콜|레이즈|올인/.test(event.text)
    );
  }

  function stop() {
    playing = false;
    if (timer) window.clearTimeout(timer);
    timer = 0;
  }

  function scheduleNext() {
    if (!playing) return;
    if (step >= events.length - 1) {
      stop();
      return;
    }
    timer = window.setTimeout(() => {
      step += 1;
      scheduleNext();
    }, eventDelay(currentEvent));
  }

  function play() {
    if (events.length < 2 || playing) return;
    if (step >= events.length - 1) step = 0;
    playing = true;
    scheduleNext();
  }

  function pause() {
    stop();
  }

  /** @param {number} delta */
  function move(delta) {
    stop();
    step = Math.max(0, Math.min(events.length - 1, step + delta));
  }

  onMount(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = window.setTimeout(play, 500);
    }
  });

  onDestroy(stop);
</script>

{#if game && seats.length >= 2 && events.length >= 2}
  <section class="seotda-replay" aria-label="섯다 게임 리플레이">
    <header>
      <div>
        <span class="eyebrow">SEOTDA REPLAY</span>
        <strong>섯다 한 판</strong>
      </div>
      <span class:loss={game.result === '패배'} class="result-chip">{game.result}</span>
    </header>

    {#if game.note}
      <p class="replay-note">{game.note}</p>
    {/if}

    <div class="game-table">
      <div class="seats">
        {#each seats as seat (seat.id)}
          <article
            class:active={currentEvent?.seatId === seat.id}
            class:action-now={currentEvent?.seatId === seat.id && currentEvent?.type === 'action'}
            class:folded={hasFoldedAtCurrentStep(seat.id)}
            class:winner={seat.winner && resultVisible}
            class:user-seat={seat.id === 'user'}
            class="seat"
          >
            <div class="seat-heading">
              <strong>{seat.name}</strong>
              <span>{formatNumber(seat.chips)}점</span>
            </div>
            <div class="cards" aria-label={`${seat.name} 패`}>
              {#each [0, 1] as cardIndex}
                {@const card = seat.cards?.[cardIndex]}
                {@const showCard = Boolean(card) && cardsRevealed}
                <div class:flipped={showCard} class="card-shell">
                  <span class="card-back">花</span>
                  {#if card}
                    <span class="card-face"><HwatuCardFace {card} /></span>
                  {/if}
                </div>
              {/each}
            </div>
            <span class="hand-name">{cardsRevealed ? seat.handName : '패 대기'}</span>
            {#if currentEvent?.seatId === seat.id && actionLabel(currentEvent)}
              {#key step}
                <span
                  class:die={actionLabel(currentEvent) === '다이'}
                  class:raise={actionLabel(currentEvent) === '레이즈'}
                  class="seat-action-tag">{actionLabel(currentEvent)}</span
                >
              {/key}
            {/if}
            {#if currentEvent?.seatId === seat.id && currentEvent?.type === 'taunt'}
              {#key step}
                <div
                  class:user-speech={seat.id === 'user'}
                  class:speech-left={npcSeats[0]?.id === seat.id}
                  class:speech-right={npcSeats[npcSeats.length - 1]?.id === seat.id}
                  class="speech-bubble"
                >
                  <span>{seat.name}</span>
                  <strong>{currentEvent.text.replace(`${seat.name}:`, '').trim()}</strong>
                </div>
              {/key}
            {/if}
          </article>
        {/each}
      </div>

      <div class="pot" aria-live="polite">
        <span>현재 팟</span>
        <strong>{formatNumber(currentEvent?.potAfter)}점</strong>
      </div>

      {#if sendsChips(currentEvent)}
        {#key step}
          <div class="chip-flight" style={chipOriginStyle(currentEvent?.seatId)} aria-hidden="true">
            <i></i><i></i><i></i>
            <strong>+{formatNumber(currentEvent?.amount)}</strong>
          </div>
        {/key}
      {/if}

      {#key step}
        <div class:taunt={currentEvent?.type === 'taunt'} class="action-bubble">
          <span>{step + 1} / {events.length}</span>
          <strong>{currentEvent?.text}</strong>
        </div>
      {/key}

      {#if ddaengVisible}
        <div class="ddaeng-layer" aria-live="polite">
          <span>✦ 🪙 땡값 정산 🪙 ✦</span>
          <strong>{game.ddaeng.handName}</strong>
          <div>
            1인당 {formatNumber(game.ddaeng.valuePerLoser)}점 · 총 {formatNumber(
              game.ddaeng.totalPaid
            )}점
          </div>
        </div>
      {/if}

      {#if resultVisible}
        <div class="winner-layer">
          <span>SHOWDOWN</span>
          <strong
            >{seats
              .filter(/** @param {ReplaySeat} seat */ (seat) => seat.winner)
              .map(/** @param {ReplaySeat} seat */ (seat) => seat.name)
              .join(', ')}</strong
          >
          <b>{game.result}</b>
        </div>
      {/if}
    </div>

    <div class="timeline" aria-hidden="true">
      <span style={`width: ${progress}%`}></span>
    </div>
    <div class="controls">
      <button type="button" onclick={() => move(-1)} disabled={step === 0} aria-label="이전 장면"
        >‹</button
      >
      <button class="play" type="button" onclick={playing ? pause : play}>
        {playing ? '일시정지' : step >= events.length - 1 ? '다시 보기' : '재생'}
      </button>
      <button
        type="button"
        onclick={() => move(1)}
        disabled={step >= events.length - 1}
        aria-label="다음 장면">›</button
      >
    </div>
  </section>
{/if}

<style>
  .seotda-replay {
    width: min(100%, 760px);
    margin: 0 auto 1.25rem;
    overflow: hidden;
    border: 2px solid #d8b24c;
    border-radius: 1.25rem;
    background: linear-gradient(145deg, #123f30, #071f19 72%);
    color: #f8f1d4;
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.3);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid rgba(235, 201, 98, 0.35);
    background: rgba(0, 0, 0, 0.22);
  }

  header > div {
    display: grid;
  }

  .eyebrow {
    color: #d9bd6b;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.16em;
  }

  header strong {
    color: #fff;
    font-size: 1.05rem;
  }

  .result-chip {
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 215, 94, 0.14);
    color: #ffd75e;
    font-weight: 900;
  }

  .result-chip.loss {
    color: #ff9999;
  }

  .replay-note {
    margin: 0.65rem 0.8rem 0;
    padding: 0.55rem 0.7rem;
    border-radius: 0.65rem;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    text-align: center;
  }

  .game-table {
    position: relative;
    min-height: 430px;
    padding: 0.8rem;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 50% 49%, rgba(72, 176, 116, 0.38), transparent 43%),
      repeating-linear-gradient(115deg, transparent 0 18px, rgba(255, 255, 255, 0.012) 18px 20px);
  }

  .seats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto minmax(108px, 1fr) auto;
    gap: 0.55rem;
    min-height: 392px;
  }

  .seat {
    position: relative;
    grid-row: 1;
    min-width: 0;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 0.8rem;
    background: rgba(0, 0, 0, 0.2);
    text-align: center;
    transition: 0.25s ease;
  }

  .seat.user-seat {
    grid-column: 2;
    grid-row: 3;
  }

  .seat.active {
    border-color: #78e6ad;
    box-shadow: 0 0 18px rgba(77, 222, 143, 0.24);
    transform: translateY(-3px);
  }

  .seat.winner {
    border-color: #ffd75e;
    background: rgba(116, 82, 8, 0.42);
    animation: winnerPulse 1s ease-in-out infinite alternate;
  }

  .seat.folded:not(.winner) {
    opacity: 0.48;
    filter: grayscale(0.65);
  }

  .seat.action-now {
    z-index: 2;
  }

  .seat-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem;
    margin-bottom: 0.4rem;
    font-size: 0.68rem;
  }

  .seat-heading strong {
    overflow: hidden;
    color: #fff;
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seat-heading span {
    color: #b7ccc1;
    white-space: nowrap;
  }

  .cards {
    display: flex;
    justify-content: center;
    gap: 0.2rem;
    min-height: 75px;
    perspective: 700px;
  }

  .card-shell {
    position: relative;
    width: min(44%, 48px);
    aspect-ratio: 2 / 3;
  }

  .card-back,
  .card-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 0.35rem;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.34);
    transition:
      opacity 0.18s ease,
      transform 0.32s cubic-bezier(0.2, 0.75, 0.25, 1);
  }

  .card-back {
    background: repeating-linear-gradient(45deg, #8a1919 0 6px, #4b0b0b 6px 12px);
    color: #f4d77a;
    font-weight: 900;
  }

  .card-face {
    opacity: 0;
    transform: scaleX(0.08);
  }

  .card-shell.flipped .card-back {
    opacity: 0;
    transform: scaleX(0.08);
  }

  .card-shell.flipped .card-face {
    opacity: 1;
    transform: scaleX(1);
  }

  .hand-name {
    display: block;
    min-height: 1.1rem;
    margin-top: 0.35rem;
    overflow: hidden;
    color: #ffe99b;
    font-size: 0.67rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seat-action-tag {
    position: absolute;
    z-index: 5;
    left: 50%;
    bottom: -0.55rem;
    min-width: 3rem;
    padding: 0.22rem 0.5rem;
    border-radius: 999px;
    background: #f7f3df;
    color: #153c2f;
    font-size: 0.72rem;
    font-weight: 900;
    box-shadow: 0 5px 13px rgba(0, 0, 0, 0.32);
    transform: translateX(-50%);
    animation: actionTagPop 0.32s cubic-bezier(0.2, 0.82, 0.25, 1.18);
  }

  .seat-action-tag.raise {
    background: #dc3545;
    color: #fff;
  }

  .seat-action-tag.die {
    border: 2px solid #a92d35;
    background: #f7e8e8;
    color: #9d2029;
    font-size: 0.82rem;
    transform: translateX(-50%) rotate(-8deg);
  }

  .speech-bubble {
    position: absolute;
    z-index: 8;
    top: calc(100% + 0.55rem);
    left: 50%;
    width: clamp(9rem, 24vw, 14rem);
    padding: 0.5rem 0.65rem;
    border: 1px solid rgba(255, 226, 118, 0.72);
    border-radius: 0.85rem;
    background: rgba(16, 20, 17, 0.96);
    color: #fff;
    text-align: left;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38);
    transform: translateX(-50%);
    animation: speechPop 0.34s cubic-bezier(0.2, 0.82, 0.25, 1.18);
  }

  .speech-bubble::before {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    border: 0.4rem solid transparent;
    border-bottom-color: rgba(16, 20, 17, 0.96);
    transform: translateX(-50%);
  }

  .speech-bubble.user-speech {
    top: auto;
    bottom: calc(100% + 0.55rem);
  }

  .speech-bubble.user-speech::before {
    top: 100%;
    bottom: auto;
    border-top-color: rgba(16, 20, 17, 0.96);
    border-bottom-color: transparent;
  }

  .speech-bubble.speech-left {
    left: 0;
    transform: none;
  }

  .speech-bubble.speech-left::before {
    left: 25%;
  }

  .speech-bubble.speech-right {
    right: 0;
    left: auto;
    transform: none;
  }

  .speech-bubble.speech-right::before {
    left: 75%;
  }

  .speech-bubble span {
    display: block;
    color: #d9bd6b;
    font-size: 0.62rem;
    font-weight: 900;
  }

  .speech-bubble strong {
    display: block;
    color: #ffe485;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .pot {
    position: absolute;
    z-index: 2;
    top: 48%;
    left: 50%;
    display: grid;
    justify-items: center;
    min-width: 7rem;
    margin: 0;
    padding: 0.45rem 0.75rem;
    border: 1px solid rgba(255, 215, 94, 0.24);
    border-radius: 999px;
    background: rgba(2, 25, 17, 0.72);
    box-shadow: 0 7px 20px rgba(0, 0, 0, 0.25);
    transform: translate(-50%, -50%);
  }

  .pot span {
    color: #a9cbbb;
    font-size: 0.65rem;
  }

  .pot strong {
    color: #ffd75e;
    font-size: 1.2rem;
  }

  .action-bubble {
    position: absolute;
    z-index: 2;
    top: 63%;
    left: 50%;
    display: grid;
    justify-items: center;
    width: min(100%, 30rem);
    min-height: 3.15rem;
    margin: 0;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    transform: translateX(-50%);
    animation: actionEnter 0.28s ease-out;
  }

  .action-bubble span {
    color: #88b69f;
    font-size: 0.61rem;
  }

  .action-bubble strong {
    color: #f7f3df;
    font-size: 0.82rem;
    text-align: center;
  }

  .action-bubble.taunt strong {
    color: #ffd75e;
    font-size: 0.95rem;
  }

  .chip-flight {
    position: absolute;
    z-index: 6;
    top: var(--chip-y);
    left: var(--chip-x);
    width: 1px;
    height: 1px;
    pointer-events: none;
    animation: chipToPot 0.72s cubic-bezier(0.25, 0.75, 0.25, 1) both;
  }

  .chip-flight i {
    position: absolute;
    width: 1rem;
    height: 0.38rem;
    border: 1px solid #fff1a7;
    border-radius: 999px;
    background: #d79d1e;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.36);
  }

  .chip-flight i:nth-child(2) {
    transform: translate(-0.15rem, -0.3rem);
  }

  .chip-flight i:nth-child(3) {
    transform: translate(0.08rem, -0.6rem);
  }

  .chip-flight strong {
    position: absolute;
    top: -1.5rem;
    left: 50%;
    color: #ffe276;
    font-size: 0.72rem;
    white-space: nowrap;
    transform: translateX(-50%);
    text-shadow: 0 2px 5px #000;
  }

  .ddaeng-layer,
  .winner-layer {
    position: absolute;
    z-index: 4;
    inset: 50% auto auto 50%;
    display: grid;
    justify-items: center;
    width: min(calc(100% - 2rem), 22rem);
    padding: 0.85rem;
    border: 2px solid #ffd75e;
    border-radius: 1rem;
    background: rgba(7, 30, 23, 0.96);
    text-align: center;
    box-shadow: 0 0 35px rgba(255, 201, 55, 0.32);
    transform: translate(-50%, -50%);
    animation: layerEnter 0.42s cubic-bezier(0.2, 0.82, 0.25, 1.18);
  }

  .ddaeng-layer > span,
  .winner-layer > span {
    color: #d9bd6b;
    font-size: 0.67rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .ddaeng-layer > strong,
  .winner-layer > strong {
    color: #ffd75e;
    font-size: 1.7rem;
  }

  .winner-layer b {
    color: #fff;
    font-size: 1.05rem;
  }

  .timeline {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
  }

  .timeline span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #c79627, #ffe485);
    transition: width 0.25s ease;
  }

  .controls {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.65rem;
    background: rgba(0, 0, 0, 0.2);
  }

  button {
    min-width: 2.5rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font: inherit;
    font-weight: 800;
  }

  button.play {
    min-width: 7rem;
    border-color: #d8b24c;
    background: #a87918;
  }

  button:disabled {
    opacity: 0.35;
  }

  @keyframes actionEnter {
    from {
      opacity: 0;
      transform: translate(-50%, 8px) scale(0.97);
    }
  }

  @keyframes actionTagPop {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.55);
    }
  }

  @keyframes speechPop {
    from {
      opacity: 0;
      scale: 0.75;
      translate: 0 -7px;
    }
  }

  @keyframes chipToPot {
    0% {
      opacity: 0;
      top: var(--chip-y);
      left: var(--chip-x);
      transform: translate(-50%, -50%) scale(0.65) rotate(-12deg);
    }
    22% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      top: 48%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1.08) rotate(10deg);
    }
  }

  @keyframes layerEnter {
    from {
      opacity: 0;
      transform: translate(-50%, -42%) scale(0.78);
    }
  }

  @keyframes winnerPulse {
    to {
      box-shadow: 0 0 22px rgba(255, 215, 94, 0.48);
      transform: translateY(-3px);
    }
  }

  @media (max-width: 575.98px) {
    .seats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: auto minmax(125px, 1fr) auto;
      gap: 0.22rem;
      min-height: 415px;
    }

    .game-table {
      min-height: 450px;
      padding: 0.55rem;
    }

    .seat {
      padding: 0.38rem 0.25rem;
    }

    .card-shell {
      width: min(45%, 45px);
    }

    .seat-heading {
      display: grid;
      justify-items: center;
    }

    .seat-heading strong {
      max-width: 100%;
      font-size: 0.76rem;
    }

    .seat-heading span {
      font-size: 0.6rem;
    }

    .action-bubble {
      top: 60%;
      width: calc(100% - 1.1rem);
    }

    .speech-bubble {
      width: min(10.5rem, 44vw);
      font-size: 0.74rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation: none !important;
      scroll-behavior: auto !important;
      transition: none !important;
    }
  }
</style>
