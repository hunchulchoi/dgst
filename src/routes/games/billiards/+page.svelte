<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import Matter from 'matter-js';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import {
    BALL_RADIUS,
    BILLIARDS_MODES,
    ANGULAR_STOP_SPEED,
    POCKET_BALL_CHANCES,
    POCKET_DRAW_RADIUS,
    CUE_SPIN_ANGULAR_SCALE,
    CUE_SPIN_STOP_VALUE,
    CUE_VERTICAL_SPIN_CONTACT_RETENTION,
    FOUR_BALL_TARGET_SCORE,
    FOUR_BALL_TARGET_OPTIONS,
    FOUR_BALL_CHANCES,
    PHYSICS_BASE_STEP_MS,
    PHYSICS_MAX_SUBSTEPS,
    RAIL_RESTITUTION,
    RAIL_CONTACT_SPIN_DAMPING,
    RAIL_THICKNESS,
    RAIL_SURFACE_FRICTION,
    MAX_ROLL_DURATION_MS,
    STOP_SPEED,
    TABLE_HEIGHT,
    TABLE_WIDTH,
    containBallInPocketTable,
    containBallInTable,
    computeBreathingAimAngle,
    advanceCueSpinResponse,
    computeAngularVelocityScale,
    computeFourBallComboMultiplier,
    computeFourBallFoulPenalty,
    computeFourBallShotScore,
    computeMaxCollisionSpeed,
    computeDynamicSpinDecay,
    computeSpinAdjustedVelocity,
    computeVerticalSpinFromTrack,
    computeDynamicVelocityScale,
    createCueSpinResponse,
    computePocketClearBonus,
    computePocketShotScore,
    computePhysicsFrameSlices,
    computePhysicsSubstepCount,
    computeRailReboundVelocity,
    computeShotVelocity,
    computeSpinFromTrack,
    evaluateFourBallShot,
    getPocketCenters,
    getPocketRailGeometry,
    getFourBallNpcDifficulty,
    isBallInPocket,
    shouldSnapStoppedSpeed,
    stopped,
    type ActiveBilliardsMode,
    type BallRole,
    type BilliardsRailSide,
    type BilliardsRankingMode,
    type CueSpinResponse,
    type FourBallTargetScore,
    type ShotContact
  } from './gameUtils';
  import { createBilliardsBallBody, createBilliardsPocketRailBodies } from './billiardsPhysics';
  import {
    computeArtScore,
    evaluateArtShot,
    getArtStage,
    type ArtScoreBreakdown,
    type ArtShotResult
  } from './artStages';
  import {
    BILLIARDS_SAVE_KEY,
    BILLIARDS_SAVE_VERSION,
    parseBilliardsSave,
    type BilliardsSave
  } from './billiardsSave';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  type Status = 'aiming' | 'charging' | 'rolling' | 'scored' | 'miss' | 'game-over';
  type RankEntry = {
    nickname: string;
    mode: string;
    score: number;
    createdAt?: string;
    _id?: string;
  };
  type FourBallTurn = 'player' | 'npc';
  type NpcShotPlan = {
    angle: number;
    power: number;
    defensive: boolean;
    rating: number;
    trajectory?: Array<{ x: number; y: number }>;
  };
  type ReplayBall = {
    id: string;
    role: BallRole;
    color: string;
    x: number;
    y: number;
  };
  type ReplayFrame = {
    at: number;
    balls: ReplayBall[];
  };
  type ShotReplay = {
    id: string;
    mode: ActiveBilliardsMode;
    targetScore: FourBallTargetScore;
    power: number;
    sideSpin: number;
    verticalSpin: number;
    startedAt: string;
    scoreBefore: number;
    outcome: string;
    tableWidth: number;
    tableHeight: number;
    ballRadius: number;
    frames: ReplayFrame[];
  };
  type ScoreEffect = {
    id: number;
    text: string;
    tone: 'score' | 'foul';
  };
  type BallBody = Matter.Body & {
    billiardsRole?: BallRole;
    billiardsId?: string;
    billiardsColor?: string;
  };
  type DrawableBall = {
    position: { x: number; y: number };
    billiardsRole?: BallRole;
    billiardsId?: string;
    billiardsColor?: string;
  };
  type RailBody = Matter.Body & {
    billiardsRail?: true;
    billiardsRailSide?: BilliardsRailSide;
  };
  type PendingRailContact = {
    ball: BallBody;
    side: BilliardsRailSide;
    normal: { x: number; y: number };
  };
  type CueSpinResponseState = {
    ball: BallBody;
    response: CueSpinResponse;
  };

  let { data }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let currentMode = $state<ActiveBilliardsMode>(BILLIARDS_MODES.FOUR_BALL);
  let artMode = $state(false);
  let artStageNumber = $state(1);
  let artObstacleBalls: BallBody[] = [];
  let artMovingObstacles: Array<{
    body: BallBody;
    origin: { x: number; y: number };
    axis: 'x' | 'y';
    range: number;
    speed: number;
  }> = [];
  let artCueContacts: string[] = [];
  let artCushionHits: string[] = [];
  let artBlackHit = false;
  let artWaypointsVisited = new Set<number>();
  let artBallCollisions = 0;
  let artShotSideSpin = 0;
  let artShotVerticalSpin = 0;
  let artResult = $state<'idle' | 'success' | 'failed'>('idle');
  let artResultMessage = $state('');
  let artHelpUsed = false;
  let artScoreBreakdown = $state<ArtScoreBreakdown | null>(null);
  let score = $state(0);
  let npcScore = $state(0);
  let targetScore = $state<FourBallTargetScore>(FOUR_BALL_TARGET_SCORE);
  let playerCombo = $state(0);
  let npcCombo = $state(0);
  let lastShotMultiplier = $state(1);
  let lastFoulPenalty = $state(0);
  let currentTurn = $state<FourBallTurn>('player');
  let npcThinking = $state(false);
  let npcMessage = $state('');
  let chances = $state(FOUR_BALL_CHANCES);
  let status = $state<Status>('aiming');
  let aimAngle = $state(-Math.PI / 2);
  let displayAimAngle = $state(-Math.PI / 2);
  let aimPoint = $state<{ x: number; y: number } | null>(null);
  let aimingStartedAt = 0;
  let isHoldingAim = false;
  let spin = $state(0);
  let verticalSpin = $state(0);
  let spinTipX = $state(0);
  let spinTipY = $state(0);
  let spinOverlayOpen = $state(false);
  let activeSpin = 0;
  let activeVerticalSpin = 0;
  let power = $state(55);
  let rankList = $state<RankEntry[]>([]);
  let rankingMode = $state<BilliardsRankingMode>(BILLIARDS_MODES.FOUR_BALL);
  let myBestScore = $state<number | null>(null);
  let todayStats = $state<{ games: number; users: number }>({ games: 0, users: 0 });
  let rankLoading = $state(false);
  let submittedGameOver = false;
  let contacts: ShotContact[] = [];
  let pocketedThisShot = 0;
  let cuePocketedThisShot = false;
  let engine: Matter.Engine | null = null;
  let pendingRailContacts: PendingRailContact[] = [];
  let pendingCueSpinResponses: CueSpinResponseState[] = [];
  let activeCueSpinResponses: CueSpinResponseState[] = [];
  let cueBall: BallBody | null = null;
  let npcCueBall: BallBody | null = null;
  let redBalls: BallBody[] = [];
  let remainingObjectCount = $state(0);
  let frameId = 0;
  let lastFrame = 0;
  let rollingPhysicsElapsedMs = 0;
  let npcTimer: ReturnType<typeof setTimeout> | null = null;
  let npcShotWasDefensive = false;
  let opponentCueHitThisShot = false;
  let replayCapture: ShotReplay | null = null;
  let replayCaptureStartedAt = 0;
  let lastPlayerReplay = $state<ShotReplay | null>(null);
  let lastReplaySampleAt = 0;
  let replaying = $state(false);
  let replayStartedAt = 0;
  let replayFrameIndex = 0;
  let reportOpen = $state(false);
  let reportNote = $state('');
  let reportSending = $state(false);
  let reportMessage = $state('');
  let shareOpen = $state(false);
  let shareTitle = $state('');
  let shareNote = $state('');
  let shareBoard = $state<'free' | 'bug'>('free');
  let shareSending = $state(false);
  let helpPlan = $state<NpcShotPlan | null>(null);
  let helpThinking = $state(false);
  let scoreEffect = $state<ScoreEffect | null>(null);
  let scoreEffectId = 0;
  let scoreEffectTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveMessage = $state('자동저장 켜짐');
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  let autoSaveMessageTimer: ReturnType<typeof setTimeout> | null = null;

  const isLoggedIn = $derived(!!data.session?.user?.email);
  const isPocketBall = $derived(!artMode && currentMode === BILLIARDS_MODES.POCKET_BALL);
  const currentArtStage = $derived(getArtStage(artStageNumber));
  const modeLabel = $derived(artMode ? '예술구 퍼즐' : isPocketBall ? '포켓볼' : '4구 당구');
  const remainingObjects = $derived(remainingObjectCount);
  const activeCombo = $derived(currentTurn === 'player' ? playerCombo : npcCombo);
  const activeComboMultiplier = $derived(computeFourBallComboMultiplier(Math.max(1, activeCombo)));
  const displayedPower = $derived(replaying && lastPlayerReplay ? lastPlayerReplay.power : power);
  const displayedSideSpin = $derived(
    replaying && lastPlayerReplay ? lastPlayerReplay.sideSpin : spin
  );
  const displayedVerticalSpin = $derived(
    replaying && lastPlayerReplay ? lastPlayerReplay.verticalSpin : verticalSpin
  );
  const displayedSpinTipX = $derived(
    replaying && lastPlayerReplay ? Math.round(lastPlayerReplay.sideSpin / 2) : spinTipX
  );
  const displayedSpinTipY = $derived(
    replaying && lastPlayerReplay ? Math.round(lastPlayerReplay.verticalSpin / 2) : spinTipY
  );
  const rankingTabs: Array<{ mode: BilliardsRankingMode; label: string }> = [
    { mode: BILLIARDS_MODES.FOUR_BALL, label: '4구' },
    { mode: BILLIARDS_MODES.POCKET_BALL, label: '포켓볼' },
    { mode: BILLIARDS_MODES.ART_PUZZLE, label: '예술구' }
  ];

  function formatRankScore(value: number) {
    return rankingMode === BILLIARDS_MODES.ART_PUZZLE ? `${value}점` : String(value);
  }
  const statusText = $derived(
    artMode
      ? artResult === 'success'
        ? '한 번에 클리어!'
        : artResult === 'failed'
          ? artResultMessage
          : currentArtStage.title
      : replaying
        ? '내 마지막 샷 다시보기'
        : !isPocketBall && status === 'game-over'
          ? score >= targetScore
            ? '승리! 겐세이 형을 이겼습니다'
            : '겐세이 형 승리'
          : !isPocketBall && npcThinking
            ? npcMessage || '겐세이 형이 수를 보는 중'
            : status === 'aiming'
              ? isPocketBall
                ? '공을 포켓에 넣으세요'
                : currentTurn === 'player'
                  ? '내 차례 · 조준하고 샷'
                  : '겐세이 형 차례'
              : status === 'charging'
                ? '게이지를 눌러 샷'
                : status === 'rolling'
                  ? `${!isPocketBall && currentTurn === 'npc' ? '겐세이 형' : '내'} 샷 진행 중`
                  : status === 'scored'
                    ? isPocketBall
                      ? '포켓 성공'
                      : `${currentTurn === 'player' ? '득점!' : 'NPC 득점'} ×${lastShotMultiplier}`
                    : status === 'miss'
                      ? !isPocketBall && lastFoulPenalty > 0
                        ? `${currentTurn === 'npc' ? 'NPC 차례' : '내 차례'} · 파울 -${lastFoulPenalty}`
                        : !isPocketBall && npcMessage
                          ? npcMessage
                          : cuePocketedThisShot
                            ? '수구 파울'
                            : !isPocketBall && currentTurn === 'npc'
                              ? '실패 · NPC 차례'
                              : '아쉽습니다. 내 차례'
                      : '게임 종료'
  );

  const Engine = Matter.Engine;
  const Bodies = Matter.Bodies;
  const Body = Matter.Body;
  const Composite = Matter.Composite;
  const Events = Matter.Events;

  function makeBall(x: number, y: number, role: BallRole, id: string, color: string): BallBody {
    const ball = createBilliardsBallBody(x, y, {
      label: id,
      render: { fillStyle: color }
    }) as BallBody;
    ball.billiardsRole = role;
    ball.billiardsId = id;
    ball.billiardsColor = color;
    return ball;
  }

  function makeRail(
    x: number,
    y: number,
    width: number,
    height: number,
    side?: RailBody['billiardsRailSide']
  ) {
    const rail = Bodies.rectangle(x, y, width, height, {
      label: 'rail',
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: RAIL_SURFACE_FRICTION,
      render: { fillStyle: '#31533b' }
    }) as RailBody;
    rail.billiardsRail = true;
    rail.billiardsRailSide = side;
    return rail;
  }

  function makeStandardRails() {
    const rail = RAIL_THICKNESS;
    return [
      makeRail(TABLE_WIDTH / 2, rail / 2, TABLE_WIDTH, rail, 'top'),
      makeRail(TABLE_WIDTH / 2, TABLE_HEIGHT - rail / 2, TABLE_WIDTH, rail, 'bottom'),
      makeRail(rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT, 'left'),
      makeRail(TABLE_WIDTH - rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT, 'right')
    ];
  }

  function makePocketRails() {
    return createBilliardsPocketRailBodies() as RailBody[];
  }

  function resetBodies() {
    if (!engine) return;
    lastFrame = performance.now();
    Composite.clear(engine.world, false);
    pendingRailContacts = [];
    pendingCueSpinResponses = [];
    activeCueSpinResponses = [];

    if (artMode) {
      const stage = currentArtStage;
      cueBall = makeBall(stage.cue.x, stage.cue.y, 'cue', 'cue', '#f8f7ef');
      npcCueBall = null;
      redBalls = stage.targets.map((ball) => makeBall(ball.x, ball.y, 'red', ball.id, ball.color));
      artObstacleBalls = stage.obstacles.map((ball) => {
        const obstacle = makeBall(ball.x, ball.y, 'red', ball.id, ball.color);
        obstacle.collisionFilter.category = 0x0002;
        if (ball.static) Body.setStatic(obstacle, true);
        return obstacle;
      });
      artMovingObstacles = stage.obstacles.flatMap((setup, index) =>
        setup.moving
          ? [
              {
                body: artObstacleBalls[index],
                origin: { x: setup.x, y: setup.y },
                ...setup.moving
              }
            ]
          : []
      );
      Composite.add(engine.world, [
        ...makeStandardRails(),
        cueBall,
        ...redBalls,
        ...artObstacleBalls
      ]);
      remainingObjectCount = redBalls.length;
      return;
    }

    artObstacleBalls = [];
    artMovingObstacles = [];

    const walls = isPocketBall ? makePocketRails() : makeStandardRails();

    cueBall = makeBall(
      TABLE_WIDTH * (isPocketBall ? 0.5 : 0.42),
      TABLE_HEIGHT * 0.72,
      'cue',
      'cue',
      '#f8f7ef'
    );
    npcCueBall = isPocketBall
      ? null
      : makeBall(TABLE_WIDTH * 0.58, TABLE_HEIGHT * 0.72, 'opponent', 'npc-cue', '#f1e8c8');
    if (isPocketBall) {
      const rackX = TABLE_WIDTH * 0.5;
      const rackY = TABLE_HEIGHT * 0.28;
      const gap = BALL_RADIUS * 2.08;
      redBalls = [
        makeBall(rackX, rackY, 'red', 'pool-1', '#f0c05a'),
        makeBall(rackX - gap / 2, rackY - gap, 'red', 'pool-2', '#2c6fbb'),
        makeBall(rackX + gap / 2, rackY - gap, 'red', 'pool-3', '#d7352a'),
        makeBall(rackX - gap, rackY - gap * 2, 'red', 'pool-4', '#6a42a6'),
        makeBall(rackX, rackY - gap * 2, 'red', 'pool-5', '#f0782f'),
        makeBall(rackX + gap, rackY - gap * 2, 'red', 'pool-6', '#248f57')
      ];
    } else {
      redBalls = [
        makeBall(TABLE_WIDTH * 0.42, TABLE_HEIGHT * 0.28, 'red', 'red-1', '#d7352a'),
        makeBall(TABLE_WIDTH * 0.58, TABLE_HEIGHT * 0.28, 'red', 'red-2', '#c71920')
      ];
    }

    Composite.add(engine.world, [
      ...walls,
      cueBall,
      ...(npcCueBall ? [npcCueBall] : []),
      ...redBalls
    ]);
    remainingObjectCount = redBalls.length;
  }

  function getSavedBalls() {
    if (!engine) return [];
    return Composite.allBodies(engine.world)
      .filter((body): body is BallBody => Boolean((body as BallBody).billiardsId))
      .map((ball) => ({
        id: ball.billiardsId ?? ball.label,
        x: ball.position.x,
        y: ball.position.y,
        vx: ball.velocity.x,
        vy: ball.velocity.y,
        angle: ball.angle,
        angularVelocity: ball.angularVelocity
      }));
  }

  function buildGameSave(): BilliardsSave {
    return {
      version: BILLIARDS_SAVE_VERSION,
      savedAt: Date.now(),
      currentMode,
      artMode,
      artStageNumber,
      score,
      npcScore,
      targetScore,
      playerCombo,
      npcCombo,
      lastShotMultiplier,
      lastFoulPenalty,
      currentTurn,
      chances,
      status,
      aimAngle,
      displayAimAngle,
      spin,
      verticalSpin,
      spinTipX,
      spinTipY,
      activeSpin,
      activeVerticalSpin,
      power,
      submittedGameOver,
      contacts,
      pocketedThisShot,
      cuePocketedThisShot,
      opponentCueHitThisShot,
      npcShotWasDefensive,
      artCueContacts,
      artCushionHits,
      artBlackHit,
      artWaypointsVisited: [...artWaypointsVisited],
      artBallCollisions,
      artShotSideSpin,
      artShotVerticalSpin,
      artResult,
      artResultMessage,
      artHelpUsed,
      artScoreBreakdown,
      activeCueSpinResponses: activeCueSpinResponses.flatMap(({ ball, response }) => {
        const ballId = ball.billiardsId ?? ball.label;
        return ballId ? [{ ballId, response }] : [];
      }),
      balls: getSavedBalls()
    };
  }

  function saveGame() {
    if (!engine) return;
    try {
      localStorage.setItem(BILLIARDS_SAVE_KEY, JSON.stringify(buildGameSave()));
    } catch (error) {
      console.error('[billiards autosave failed]', error);
    }
  }

  function showRestoredMessage() {
    autoSaveMessage = '게임 복원됨';
    if (autoSaveMessageTimer) clearTimeout(autoSaveMessageTimer);
    autoSaveMessageTimer = setTimeout(() => {
      autoSaveMessage = '자동저장 켜짐';
      autoSaveMessageTimer = null;
    }, 3500);
  }

  function restoreSavedGame() {
    if (!engine) return false;
    let saved: BilliardsSave | null = null;
    try {
      const raw = localStorage.getItem(BILLIARDS_SAVE_KEY);
      saved = parseBilliardsSave(raw);
      if (raw && !saved) localStorage.removeItem(BILLIARDS_SAVE_KEY);
    } catch (error) {
      console.error('[billiards autosave restore failed]', error);
      return false;
    }
    if (!saved) return false;

    currentMode = saved.currentMode;
    artMode = saved.artMode;
    artStageNumber = saved.artStageNumber;
    rankingMode = saved.artMode ? BILLIARDS_MODES.ART_PUZZLE : saved.currentMode;
    score = saved.score;
    npcScore = saved.npcScore;
    targetScore = saved.targetScore;
    playerCombo = saved.playerCombo;
    npcCombo = saved.npcCombo;
    lastShotMultiplier = saved.lastShotMultiplier;
    lastFoulPenalty = saved.lastFoulPenalty;
    currentTurn = saved.currentTurn;
    chances = saved.chances;
    status = saved.status === 'charging' ? 'aiming' : saved.status;
    aimAngle = saved.aimAngle;
    displayAimAngle = saved.displayAimAngle;
    spin = saved.spin;
    verticalSpin = saved.verticalSpin;
    spinTipX = saved.spinTipX;
    spinTipY = saved.spinTipY;
    activeSpin = saved.activeSpin;
    activeVerticalSpin = saved.activeVerticalSpin;
    power = saved.power;
    submittedGameOver = saved.submittedGameOver;
    contacts = saved.contacts;
    pocketedThisShot = saved.pocketedThisShot;
    cuePocketedThisShot = saved.cuePocketedThisShot;
    opponentCueHitThisShot = saved.opponentCueHitThisShot;
    npcShotWasDefensive = saved.npcShotWasDefensive;
    artCueContacts = saved.artCueContacts;
    artCushionHits = saved.artCushionHits;
    artBlackHit = saved.artBlackHit;
    artWaypointsVisited = new Set(saved.artWaypointsVisited);
    artBallCollisions = saved.artBallCollisions;
    artShotSideSpin = saved.artShotSideSpin;
    artShotVerticalSpin = saved.artShotVerticalSpin;
    artResult = saved.artResult;
    artResultMessage = saved.artResultMessage;
    artHelpUsed = saved.artHelpUsed;
    artScoreBreakdown = saved.artScoreBreakdown;
    npcThinking = false;
    npcMessage = '';
    replayCapture = null;
    replaying = false;
    helpPlan = null;
    spinOverlayOpen = false;

    resetBodies();
    const savedById = new Map(saved.balls.map((ball) => [ball.id, ball]));
    const createdBalls = [
      ...(cueBall ? [cueBall] : []),
      ...(npcCueBall ? [npcCueBall] : []),
      ...redBalls,
      ...artObstacleBalls
    ];
    for (const ball of createdBalls) {
      const savedBall = savedById.get(ball.billiardsId ?? ball.label);
      if (!savedBall) {
        Composite.remove(engine.world, ball);
        continue;
      }
      Body.setPosition(ball, { x: savedBall.x, y: savedBall.y });
      Body.setVelocity(ball, { x: savedBall.vx, y: savedBall.vy });
      Body.setAngle(ball, savedBall.angle);
      Body.setAngularVelocity(ball, savedBall.angularVelocity);
    }
    redBalls = redBalls.filter((ball) => savedById.has(ball.billiardsId ?? ball.label));
    const restoredBallsById = new Map(
      createdBalls
        .filter((ball) => savedById.has(ball.billiardsId ?? ball.label))
        .map((ball) => [ball.billiardsId ?? ball.label, ball])
    );
    activeCueSpinResponses = saved.activeCueSpinResponses.flatMap(({ ballId, response }) => {
      const ball = restoredBallsById.get(ballId);
      return ball ? [{ ball, response }] : [];
    });
    remainingObjectCount = redBalls.length;
    rollingPhysicsElapsedMs = 0;
    showRestoredMessage();
    return true;
  }

  function newGame() {
    if (npcTimer) clearTimeout(npcTimer);
    npcTimer = null;
    score = 0;
    npcScore = 0;
    playerCombo = 0;
    npcCombo = 0;
    lastShotMultiplier = 1;
    lastFoulPenalty = 0;
    currentTurn = 'player';
    npcThinking = false;
    npcMessage = '';
    npcShotWasDefensive = false;
    opponentCueHitThisShot = false;
    replayCapture = null;
    replayCaptureStartedAt = 0;
    lastPlayerReplay = null;
    lastReplaySampleAt = 0;
    replaying = false;
    replayStartedAt = 0;
    replayFrameIndex = 0;
    reportOpen = false;
    reportNote = '';
    reportSending = false;
    reportMessage = '';
    helpPlan = null;
    helpThinking = false;
    scoreEffect = null;
    if (scoreEffectTimer) clearTimeout(scoreEffectTimer);
    scoreEffectTimer = null;
    chances = isPocketBall ? POCKET_BALL_CHANCES : FOUR_BALL_CHANCES;
    status = 'aiming';
    contacts = [];
    aimAngle = -Math.PI / 2;
    displayAimAngle = -Math.PI / 2;
    aimPoint = null;
    aimingStartedAt = 0;
    isHoldingAim = false;
    spin = 0;
    verticalSpin = 0;
    spinTipX = 0;
    spinTipY = 0;
    activeSpin = 0;
    activeVerticalSpin = 0;
    power = 55;
    rollingPhysicsElapsedMs = 0;
    submittedGameOver = false;
    pocketedThisShot = 0;
    cuePocketedThisShot = false;
    artCueContacts = [];
    artCushionHits = [];
    artBlackHit = false;
    artWaypointsVisited = new Set<number>();
    artBallCollisions = 0;
    artShotSideSpin = 0;
    artShotVerticalSpin = 0;
    artResult = 'idle';
    artResultMessage = '';
    artHelpUsed = false;
    artScoreBreakdown = null;
    resetBodies();
    saveGame();
  }

  function switchMode(mode: ActiveBilliardsMode) {
    if (!artMode && currentMode === mode) return;
    artMode = false;
    currentMode = mode;
    rankingMode = mode;
    rankList = [];
    myBestScore = null;
    todayStats = { games: 0, users: 0 };
    newGame();
    void loadRank(mode);
  }

  function switchToArtMode() {
    if (artMode) return;
    artMode = true;
    currentMode = BILLIARDS_MODES.FOUR_BALL;
    rankingMode = BILLIARDS_MODES.ART_PUZZLE;
    rankList = [];
    myBestScore = null;
    todayStats = { games: 0, users: 0 };
    newGame();
    void loadRank(BILLIARDS_MODES.ART_PUZZLE);
  }

  function selectArtStage(stage: number) {
    if (artStageNumber === stage) return;
    artStageNumber = stage;
    newGame();
  }

  function nextArtStage() {
    if (artStageNumber < 10) artStageNumber += 1;
    newGame();
  }

  function switchTargetScore(nextTarget: FourBallTargetScore) {
    if (targetScore === nextTarget || isPocketBall) return;
    targetScore = nextTarget;
    newGame();
  }

  function selectRankingMode(mode: BilliardsRankingMode) {
    if (rankingMode === mode && rankList.length > 0) return;
    rankingMode = mode;
    rankList = [];
    myBestScore = null;
    todayStats = { games: 0, users: 0 };
    void loadRank(mode);
  }

  function getTrackedBalls(): BallBody[] {
    // A scratched cue ball stays referenced so it can be spotted after the shot,
    // but must not be drawn or clamped back onto the table while it is pocketed.
    return [
      ...(cueBall && !cuePocketedThisShot ? [cueBall] : []),
      ...(npcCueBall ? [npcCueBall] : []),
      ...redBalls,
      ...artObstacleBalls
    ];
  }

  function makeReplayFrame(at: number): ReplayFrame {
    return {
      at: Math.max(0, Math.round(at)),
      balls: getTrackedBalls().map((ball) => ({
        id: ball.billiardsId ?? ball.label,
        role: ball.billiardsRole ?? 'red',
        color: ball.billiardsColor ?? '#d7352a',
        x: Math.round(ball.position.x * 100) / 100,
        y: Math.round(ball.position.y * 100) / 100
      }))
    };
  }

  function beginPlayerReplay(selectedPower: number) {
    const startedAt = performance.now();
    replayCaptureStartedAt = startedAt;
    replayCapture = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode: currentMode,
      targetScore,
      power: selectedPower,
      sideSpin: spin,
      verticalSpin,
      startedAt: new Date().toISOString(),
      scoreBefore: score,
      outcome: '',
      tableWidth: TABLE_WIDTH,
      tableHeight: TABLE_HEIGHT,
      ballRadius: BALL_RADIUS,
      frames: [makeReplayFrame(0)]
    };
    lastReplaySampleAt = startedAt;
    reportMessage = '';
  }

  function capturePlayerReplayFrame(now: number, force = false) {
    if (!replayCapture || replayCapture.frames.length >= 260) return;
    if (!force && now - lastReplaySampleAt < 50) return;
    replayCapture.frames.push(makeReplayFrame(now - replayCaptureStartedAt));
    lastReplaySampleAt = now;
  }

  function finishPlayerReplay(outcome: string) {
    if (!replayCapture) return;
    capturePlayerReplayFrame(performance.now(), true);
    replayCapture.outcome = outcome;
    lastPlayerReplay = replayCapture;
    replayCapture = null;
    replayCaptureStartedAt = 0;
  }

  function startReplay() {
    if (!lastPlayerReplay || status === 'rolling' || npcThinking || replaying) return;
    replaying = true;
    replayStartedAt = performance.now();
    replayFrameIndex = 0;
    reportMessage = '';
  }

  function openReport() {
    if (!lastPlayerReplay || status === 'rolling' || npcThinking || replaying) return;
    reportNote = '';
    reportMessage = '';
    reportOpen = true;
  }

  function closeReport() {
    if (reportSending) return;
    reportOpen = false;
  }

  function openShare() {
    if (!lastPlayerReplay || status === 'rolling' || npcThinking || replaying) return;
    if (!isLoggedIn) {
      reportMessage = '게시판 공유는 로그인 후 가능합니다.';
      return;
    }
    shareTitle = `[당구 리플레이] ${lastPlayerReplay.outcome || '내 샷'}`;
    shareNote = '';
    shareBoard = 'free';
    reportMessage = '';
    shareOpen = true;
  }

  function closeShare() {
    if (shareSending) return;
    shareOpen = false;
  }

  function getReportFrames(replay: ShotReplay) {
    const maxFrames = 80;
    if (replay.frames.length <= maxFrames) return replay.frames;
    return Array.from(
      { length: maxFrames },
      (_, index) =>
        replay.frames[Math.floor((index * (replay.frames.length - 1)) / (maxFrames - 1))]
    );
  }

  async function submitShotReport() {
    if (!lastPlayerReplay || reportSending) return;
    reportSending = true;
    reportMessage = '';
    try {
      const replay = lastPlayerReplay;
      const response = await fetch('/games/billiards/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: reportNote.trim(),
          replay: {
            ...replay,
            frames: getReportFrames(replay)
          }
        })
      });
      if (!response.ok) throw new Error('report failed');
      reportOpen = false;
      reportMessage = '오류신고 완료. 고마워요.';
    } catch {
      reportMessage = '신고 전송 실패. 다시 눌러주세요.';
    } finally {
      reportSending = false;
    }
  }

  async function submitReplayShare() {
    if (!lastPlayerReplay || shareSending) return;
    shareSending = true;
    reportMessage = '';
    try {
      const replay = lastPlayerReplay;
      const response = await fetch('/games/billiards/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: shareBoard,
          title: shareTitle.trim(),
          note: shareNote.trim(),
          replay: { ...replay, frames: getReportFrames(replay) }
        })
      });
      const result = await response.json();
      if (!response.ok || !result.articleId) {
        throw new Error(result?.message || 'share failed');
      }
      shareOpen = false;
      await goto(resolve(`/board/${result.boardId}/${result.articleId}`));
    } catch {
      reportMessage = '게시판 공유 실패. 다시 눌러주세요.';
    } finally {
      shareSending = false;
    }
  }

  function finishFourBallGame() {
    status = 'game-over';
    npcThinking = false;
    npcMessage = '';
    if (npcTimer) clearTimeout(npcTimer);
    npcTimer = null;
    void submitScore();
  }

  function showScoreEffect(amount: number, tone: ScoreEffect['tone']) {
    if (amount <= 0) return;
    if (scoreEffectTimer) clearTimeout(scoreEffectTimer);
    scoreEffect = {
      id: ++scoreEffectId,
      text: tone === 'foul' ? `빡 -${amount}` : `+${amount}`,
      tone
    };
    scoreEffectTimer = setTimeout(() => {
      scoreEffect = null;
      scoreEffectTimer = null;
    }, 2500);
  }

  function settleArtShot() {
    const shot: ArtShotResult = {
      cueContacts: artCueContacts,
      cushionHits: artCushionHits,
      blackHit: artBlackHit,
      waypointCount: artWaypointsVisited.size,
      ballCollisions: artBallCollisions,
      sideSpin: artShotSideSpin,
      verticalSpin: artShotVerticalSpin
    };
    const result = evaluateArtShot(currentArtStage, shot);
    finishPlayerReplay(result.message);
    artResult = result.success ? 'success' : 'failed';
    artResultMessage = result.message;
    status = 'game-over';
    if (result.success) {
      artScoreBreakdown = computeArtScore(currentArtStage, shot, artHelpUsed);
      score = artScoreBreakdown.total;
      showScoreEffect(score, 'score');
      void submitScore(BILLIARDS_MODES.ART_PUZZLE, score);
    }
  }

  function settleShot() {
    rollingPhysicsElapsedMs = 0;
    pendingCueSpinResponses = [];
    activeCueSpinResponses = [];
    const balls = getTrackedBalls();
    for (const ball of balls) {
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
    }
    activeVerticalSpin = 0;

    if (artMode) {
      contacts = [];
      settleArtShot();
      return;
    }

    const result = evaluateFourBallShot(contacts);
    contacts = [];

    if (isPocketBall) {
      const shotScore = computePocketShotScore(pocketedThisShot, cuePocketedThisShot);
      finishPlayerReplay(
        cuePocketedThisShot
          ? '수구 파울'
          : pocketedThisShot > 0
            ? `${pocketedThisShot}개 포켓 · +${shotScore}`
            : '실패'
      );
      if (shotScore > 0) score += shotScore;

      if (redBalls.length === 0) {
        const clearBonus = computePocketClearBonus(chances);
        score += clearBonus;
        showScoreEffect(shotScore + clearBonus, 'score');
        status = 'game-over';
        pocketedThisShot = 0;
        cuePocketedThisShot = false;
        void submitScore();
        return;
      }

      if (pocketedThisShot > 0 && !cuePocketedThisShot) {
        showScoreEffect(shotScore, 'score');
        status = 'scored';
        pocketedThisShot = 0;
        cuePocketedThisShot = false;
        return;
      }

      chances = Math.max(0, chances - 1);
      if (cuePocketedThisShot) resetCueBall();
      pocketedThisShot = 0;
      cuePocketedThisShot = false;
      if (chances === 0) {
        status = 'game-over';
        void submitScore();
        return;
      }
      status = 'miss';
      return;
    }

    const foulPenalty = computeFourBallFoulPenalty(result.hitRedIds.length, opponentCueHitThisShot);
    if (currentTurn === 'player') {
      finishPlayerReplay(
        foulPenalty > 0 ? `파울 -${foulPenalty}` : result.scored ? '득점' : '실패'
      );
    }
    opponentCueHitThisShot = false;
    lastFoulPenalty = foulPenalty;
    if (foulPenalty > 0) {
      showScoreEffect(foulPenalty, 'foul');
      if (currentTurn === 'player') {
        score = Math.max(0, score - foulPenalty);
        playerCombo = 0;
        currentTurn = 'npc';
        npcMessage = '';
        status = 'miss';
        scheduleNpcShot(850);
      } else {
        npcScore = Math.max(0, npcScore - foulPenalty);
        npcCombo = 0;
        currentTurn = 'player';
        npcThinking = false;
        npcMessage = '';
        npcShotWasDefensive = false;
        status = 'miss';
      }
      return;
    }

    if (result.scored) {
      if (currentTurn === 'player') {
        playerCombo += 1;
        lastShotMultiplier = computeFourBallComboMultiplier(playerCombo);
        const shotPoints = computeFourBallShotScore(playerCombo);
        score += shotPoints;
        showScoreEffect(shotPoints, 'score');
        npcMessage = '';
        status = 'scored';
        if (score >= targetScore) finishFourBallGame();
      } else {
        npcCombo += 1;
        lastShotMultiplier = computeFourBallComboMultiplier(npcCombo);
        const shotPoints = computeFourBallShotScore(npcCombo);
        npcScore += shotPoints;
        showScoreEffect(shotPoints, 'score');
        npcMessage = '';
        status = 'scored';
        if (npcScore >= targetScore) finishFourBallGame();
        else scheduleNpcShot(850);
      }
      return;
    }

    if (currentTurn === 'player') {
      playerCombo = 0;
      currentTurn = 'npc';
      npcMessage = '';
      status = 'miss';
      scheduleNpcShot(700);
    } else {
      npcCombo = 0;
      currentTurn = 'player';
      npcThinking = false;
      npcMessage = npcShotWasDefensive ? '겐세이! 어려운 배치를 남겼습니다' : 'NPC 실패 · 내 차례';
      npcShotWasDefensive = false;
      status = 'miss';
    }
  }

  function resetCueBall() {
    if (!cueBall || !engine) return;
    pendingCueSpinResponses = [];
    activeCueSpinResponses = [];
    Body.setPosition(cueBall, { x: TABLE_WIDTH * 0.5, y: TABLE_HEIGHT * 0.72 });
    Body.setVelocity(cueBall, { x: 0, y: 0 });
    Body.setAngularVelocity(cueBall, 0);
    Composite.add(engine.world, cueBall);
  }

  function getRailContact(
    rawBodyA: Matter.Body,
    rawBodyB: Matter.Body,
    collisionNormal: Matter.Vector
  ): PendingRailContact | null {
    const bodyA = rawBodyA as BallBody & RailBody;
    const bodyB = rawBodyB as BallBody & RailBody;
    const rail = bodyA.billiardsRail ? bodyA : bodyB.billiardsRail ? bodyB : null;
    const ball = rail === bodyA ? bodyB : rail === bodyB ? bodyA : null;
    if (!rail?.billiardsRailSide || !ball?.billiardsId) return null;
    return {
      ball,
      side: rail.billiardsRailSide,
      normal: { x: collisionNormal.x, y: collisionNormal.y }
    };
  }

  function applyPendingRailResponses() {
    for (const contact of pendingRailContacts) {
      const railSpin = contact.ball === cueBall ? activeSpin : 0;
      Body.setVelocity(
        contact.ball,
        computeRailReboundVelocity(contact.ball.velocity, contact.side, contact.normal, railSpin)
      );
      if (contact.ball === cueBall && activeSpin !== 0) {
        activeSpin *= RAIL_CONTACT_SPIN_DAMPING;
        if (Math.abs(activeSpin) < CUE_SPIN_STOP_VALUE) activeSpin = 0;
        Body.setAngularVelocity(cueBall, -activeSpin / CUE_SPIN_ANGULAR_SCALE);
      }
    }
    pendingRailContacts = [];
  }

  function queueCueSpinResponse(cue: BallBody, target: BallBody) {
    if (activeVerticalSpin === 0 || !target.billiardsId) return;
    const response = createCueSpinResponse(
      Body.getVelocity(cue),
      Body.getVelocity(target),
      {
        x: target.position.x - cue.position.x,
        y: target.position.y - cue.position.y
      },
      activeVerticalSpin
    );
    if (response) pendingCueSpinResponses.push({ ball: cue, response });
  }

  function activatePendingCueSpinResponses() {
    if (pendingCueSpinResponses.length === 0) return;
    activeCueSpinResponses.push(...pendingCueSpinResponses);
    for (const pending of pendingCueSpinResponses) {
      if (pending.ball === cueBall) {
        activeVerticalSpin *= CUE_VERTICAL_SPIN_CONTACT_RETENTION;
      }
    }
    pendingCueSpinResponses = [];
    if (Math.abs(activeVerticalSpin) < CUE_SPIN_STOP_VALUE) activeVerticalSpin = 0;
  }

  function advanceCueSpinResponses(delta: number) {
    const nextResponses: CueSpinResponseState[] = [];
    for (const active of activeCueSpinResponses) {
      const next = advanceCueSpinResponse(Body.getVelocity(active.ball), active.response, delta);
      Body.setVelocity(active.ball, next.velocity);
      if (next.response) nextResponses.push({ ball: active.ball, response: next.response });
    }
    activeCueSpinResponses = nextResponses;
  }

  function ballHasSpinResponse(ball: BallBody) {
    return activeCueSpinResponses.some((active) => active.ball === ball);
  }

  function queueActiveCueSpinContact(bodyA: BallBody, bodyB: BallBody) {
    const activeCue = isPocketBall || currentTurn === 'player' ? cueBall : npcCueBall;
    const cue = bodyA === activeCue ? bodyA : bodyB === activeCue ? bodyB : null;
    if (!cue) return;
    const target = cue === bodyA ? bodyB : bodyA;
    if (target.billiardsId) queueCueSpinResponse(cue, target);
  }

  function recordCueContact(bodyA: BallBody, bodyB: BallBody) {
    const activeCue = isPocketBall || currentTurn === 'player' ? cueBall : npcCueBall;
    const cue = bodyA === activeCue ? bodyA : bodyB === activeCue ? bodyB : null;
    const target = cue === bodyA ? bodyB : bodyA;
    const opposingCue = currentTurn === 'player' ? npcCueBall : cueBall;
    if (!isPocketBall && cue && target === opposingCue) {
      opponentCueHitThisShot = true;
      return;
    }
    if (!cue || target.billiardsRole !== 'red' || !target.billiardsId) return;
    contacts = [...contacts, { cueRole: cue.billiardsRole ?? 'cue', targetId: target.billiardsId }];
  }

  function recordArtCollision(rawBodyA: Matter.Body, rawBodyB: Matter.Body) {
    const bodyA = rawBodyA as BallBody & RailBody;
    const bodyB = rawBodyB as BallBody & RailBody;
    const rail = bodyA.billiardsRail ? bodyA : bodyB.billiardsRail ? bodyB : null;
    const cue = bodyA === cueBall ? bodyA : bodyB === cueBall ? bodyB : null;
    const other = cue === bodyA ? bodyB : cue === bodyB ? bodyA : null;

    if (cue && rail?.billiardsRailSide)
      artCushionHits = [...artCushionHits, rail.billiardsRailSide];
    if (cue && other?.billiardsId) {
      artCueContacts = [...artCueContacts, other.billiardsId];
      if (other.billiardsId.startsWith('black-')) artBlackHit = true;
    }
    if (!bodyA.billiardsRail && !bodyB.billiardsRail && bodyA !== cueBall && bodyB !== cueBall) {
      artBallCollisions += 1;
    }
  }

  function simulateFourBallShot(
    shooterTurn: FourBallTurn,
    angle: number,
    selectedPower: number,
    captureTrajectory = false
  ): {
    rating: number;
    scored: boolean;
    trajectory: Array<{ x: number; y: number }>;
  } {
    if (!cueBall || !npcCueBall || redBalls.length < 2) {
      return { rating: Number.NEGATIVE_INFINITY, scored: false, trajectory: [] };
    }

    const simulation = Engine.create({ gravity: { x: 0, y: 0 } });
    const simPlayer = makeBall(cueBall.position.x, cueBall.position.y, 'cue', 'sim-player', '#fff');
    const simNpc = makeBall(
      npcCueBall.position.x,
      npcCueBall.position.y,
      'opponent',
      'sim-npc',
      '#fff'
    );
    const simReds = redBalls.map((ball, index) =>
      makeBall(ball.position.x, ball.position.y, 'red', `sim-red-${index}`, '#d7352a')
    );
    const simShooter = shooterTurn === 'player' ? simPlayer : simNpc;
    const simOpponent = shooterTurn === 'player' ? simNpc : simPlayer;
    const rail = RAIL_THICKNESS;
    const walls = [
      makeRail(TABLE_WIDTH / 2, rail / 2, TABLE_WIDTH, rail, 'top'),
      makeRail(TABLE_WIDTH / 2, TABLE_HEIGHT - rail / 2, TABLE_WIDTH, rail, 'bottom'),
      makeRail(rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT, 'left'),
      makeRail(TABLE_WIDTH - rail / 2, TABLE_HEIGHT / 2, rail, TABLE_HEIGHT, 'right')
    ];
    const movingBalls = [simPlayer, simNpc, ...simReds];
    const trajectory = captureTrajectory
      ? [{ x: simShooter.position.x, y: simShooter.position.y }]
      : [];
    const hitIds = new Set<string>();
    let hitOpponentCue = false;
    let pendingSimulationRailContacts: PendingRailContact[] = [];
    const collisionHandler = (event: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of event.pairs) {
        const railContact = getRailContact(pair.bodyA, pair.bodyB, pair.collision.normal);
        if (railContact) pendingSimulationRailContacts.push(railContact);
        const other =
          pair.bodyA === simShooter ? pair.bodyB : pair.bodyB === simShooter ? pair.bodyA : null;
        if (other === simOpponent) hitOpponentCue = true;
        const target = other as BallBody | null;
        if (target?.billiardsRole === 'red' && target.billiardsId) hitIds.add(target.billiardsId);
      }
    };

    Events.on(simulation, 'collisionStart', collisionHandler);
    Composite.add(simulation.world, [...walls, ...movingBalls]);
    Body.setVelocity(simShooter, computeShotVelocity(angle, selectedPower));

    for (let step = 0; step < 210; step += 1) {
      let remainingDelta = PHYSICS_BASE_STEP_MS;
      for (
        let substep = 0;
        remainingDelta > 0.0001 && substep < PHYSICS_MAX_SUBSTEPS;
        substep += 1
      ) {
        const collisionSpeed = computeMaxCollisionSpeed(movingBalls);
        const remainingSubsteps = computePhysicsSubstepCount(collisionSpeed, remainingDelta);
        const substepDelta =
          substep === PHYSICS_MAX_SUBSTEPS - 1
            ? remainingDelta
            : remainingDelta / remainingSubsteps;
        Engine.update(simulation, substepDelta);
        for (const contact of pendingSimulationRailContacts) {
          Body.setVelocity(
            contact.ball,
            computeRailReboundVelocity(contact.ball.velocity, contact.side, contact.normal)
          );
        }
        pendingSimulationRailContacts = [];
        for (const ball of movingBalls) {
          const contained = containBallInTable({
            position: ball.position,
            velocity: ball.velocity
          });
          if (contained.corrected) {
            Body.setPosition(ball, contained.position);
            Body.setVelocity(ball, contained.velocity);
          }
          const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
          if (shouldSnapStoppedSpeed(speed)) {
            Body.setVelocity(ball, { x: 0, y: 0 });
          } else {
            const scale = computeDynamicVelocityScale(speed, substepDelta);
            Body.setVelocity(ball, {
              x: ball.velocity.x * scale,
              y: ball.velocity.y * scale
            });
          }
        }
        remainingDelta = Math.max(0, remainingDelta - substepDelta);
      }
      if (captureTrajectory && step % 3 === 0) {
        trajectory.push({ x: simShooter.position.x, y: simShooter.position.y });
      }
      if (step > 20 && stopped(movingBalls, STOP_SPEED)) break;
    }

    const scored = hitIds.size >= 2 && !hitOpponentCue;
    const opponentToNearestRed = Math.min(
      ...simReds.map((ball) =>
        Math.hypot(
          ball.position.x - simOpponent.position.x,
          ball.position.y - simOpponent.position.y
        )
      )
    );
    const redSpread = Math.hypot(
      simReds[0].position.x - simReds[1].position.x,
      simReds[0].position.y - simReds[1].position.y
    );
    const defenseValue = opponentToNearestRed * 1.4 + redSpread * 0.65;
    const foulPenalty = computeFourBallFoulPenalty(hitIds.size, hitOpponentCue);
    const rating =
      (scored ? 100_000 : 0) +
      hitIds.size * 4_000 +
      defenseValue -
      selectedPower -
      foulPenalty * 10_000;

    Events.off(simulation, 'collisionStart', collisionHandler);
    Composite.clear(simulation.world, false);
    Engine.clear(simulation);
    return { rating, scored, trajectory };
  }

  function chooseFourBallShot(shooterTurn: FourBallTurn, candidateBudget: number): NpcShotPlan {
    const shooterBall = shooterTurn === 'player' ? cueBall : npcCueBall;
    if (!shooterBall || redBalls.length < 2) {
      return { angle: -Math.PI / 2, power: 55, defensive: true, rating: 0 };
    }

    const candidates: Array<{ angle: number; power: number }> = [];
    const offsets = [-0.42, -0.3, -0.2, -0.12, -0.06, 0, 0.06, 0.12, 0.2, 0.3, 0.42];
    for (const red of redBalls) {
      const baseAngle = Math.atan2(
        red.position.y - shooterBall.position.y,
        red.position.x - shooterBall.position.x
      );
      for (const offset of offsets) {
        for (const candidatePower of [48, 64, 80]) {
          candidates.push({ angle: baseAngle + offset, power: candidatePower });
        }
      }
    }
    for (let index = 0; index < 18; index += 1) {
      candidates.push({
        angle: (index / 18) * Math.PI * 2,
        power: 55 + (index % 3) * 15
      });
    }

    const selectedCandidates =
      candidateBudget >= candidates.length
        ? candidates
        : Array.from(
            { length: candidateBudget },
            (_, index) => candidates[Math.floor((index * candidates.length) / candidateBudget)]
          );
    let best: NpcShotPlan = {
      angle: selectedCandidates[0].angle,
      power: selectedCandidates[0].power,
      defensive: true,
      rating: Number.NEGATIVE_INFINITY
    };
    for (const candidate of selectedCandidates) {
      const result = simulateFourBallShot(shooterTurn, candidate.angle, candidate.power);
      if (result.rating <= best.rating) continue;
      best = {
        ...candidate,
        defensive: !result.scored,
        rating: result.rating
      };
    }
    return best;
  }

  function chooseNpcShot(): NpcShotPlan {
    return chooseFourBallShot('npc', getFourBallNpcDifficulty(targetScore).candidateBudget);
  }

  function showShotHelp() {
    if (isPocketBall || currentTurn !== 'player' || !canPrepareShot()) return;
    if (helpPlan) {
      helpPlan = null;
      return;
    }

    if (artMode) {
      const solution = currentArtStage.solution;
      artHelpUsed = true;
      helpPlan = {
        angle: solution.angle,
        power: solution.power,
        defensive: false,
        rating: 1,
        trajectory: solution.trajectory
      };
      return;
    }

    helpThinking = true;
    setTimeout(() => {
      if (isPocketBall || currentTurn !== 'player' || status === 'rolling') {
        helpThinking = false;
        return;
      }
      const plan = chooseFourBallShot('player', 52);
      const preview = simulateFourBallShot('player', plan.angle, plan.power, true);
      helpPlan = { ...plan, trajectory: preview.trajectory };
      helpThinking = false;
    }, 0);
  }

  function performNpcShot() {
    if (isPocketBall || currentTurn !== 'npc' || status === 'game-over' || !npcCueBall) return;
    const plan = chooseNpcShot();
    const difficulty = getFourBallNpcDifficulty(targetScore);
    const aimError = difficulty.aimError * (plan.defensive ? 1.15 : 1);
    const actualAngle = plan.angle + (Math.random() - 0.5) * aimError * 2;
    npcShotWasDefensive = plan.defensive;
    npcMessage = plan.defensive ? '겐세이 노리는 중…' : '득점 코스 발견';
    npcThinking = false;
    contacts = [];
    lastFoulPenalty = 0;
    opponentCueHitThisShot = false;
    activeSpin = 0;
    activeVerticalSpin = 0;
    pendingCueSpinResponses = [];
    activeCueSpinResponses = [];
    Body.setVelocity(npcCueBall, computeShotVelocity(actualAngle, plan.power));
    Body.setAngularVelocity(npcCueBall, 0);
    status = 'rolling';
    rollingPhysicsElapsedMs = 0;
    lastFrame = performance.now();
  }

  function scheduleNpcShot(delayMs: number) {
    if (npcTimer) clearTimeout(npcTimer);
    npcThinking = true;
    npcMessage = '겐세이 형이 수를 보는 중…';
    npcTimer = setTimeout(() => {
      npcTimer = null;
      performNpcShot();
    }, delayMs);
  }

  function getCanvasPoint(event: PointerEvent) {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
    };
  }

  function canPrepareShot() {
    return (
      !replaying &&
      !helpThinking &&
      (isPocketBall || (currentTurn === 'player' && !npcThinking)) &&
      (status === 'aiming' || status === 'scored' || status === 'miss')
    );
  }

  function canAim() {
    return canPrepareShot();
  }

  function canSpin() {
    return canPrepareShot();
  }

  function canCharge() {
    return canPrepareShot();
  }

  function canShowAimGuide() {
    return canPrepareShot() || status === 'charging';
  }

  function resetAimDrag() {
    isHoldingAim = false;
  }

  function resetSpinTip() {
    spin = 0;
    verticalSpin = 0;
    spinTipX = 0;
    spinTipY = 0;
  }

  function openSpinOverlay() {
    if (!canSpin()) return;
    spinOverlayOpen = true;
  }

  function closeSpinOverlay() {
    spinOverlayOpen = false;
  }

  function updateAimFromPointer(event: PointerEvent) {
    if (!cueBall || !canAim()) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    const dx = point.x - cueBall.position.x;
    const dy = point.y - cueBall.position.y;
    if (Math.hypot(dx, dy) < BALL_RADIUS * 1.4) return;
    event.preventDefault();
    helpPlan = null;
    aimAngle = Math.atan2(dy, dx);
    displayAimAngle = aimAngle;
    aimPoint = point;
  }

  function updateSpinFromPointer(event: PointerEvent) {
    if (!canSpin()) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    helpPlan = null;
    spin = computeSpinFromTrack(x, rect.width);
    verticalSpin = computeVerticalSpinFromTrack(y, rect.height);
    spinTipX = Math.round(spin / 2);
    spinTipY = Math.round(verticalSpin / 2);
    event.preventDefault();
  }

  function handleSpinPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    updateSpinFromPointer(event);
  }

  function updatePowerFromPointer(event: PointerEvent) {
    if (!canCharge()) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    helpPlan = null;
    power = Math.round(10 + (x / rect.width) * 90);
    event.preventDefault();
  }

  function handlePowerPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    updatePowerFromPointer(event);
  }

  function handlePowerKeyDown(event: KeyboardEvent) {
    if (!canCharge()) return;
    const step = event.shiftKey ? 10 : 5;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      helpPlan = null;
      power = Math.max(10, power - step);
      event.preventDefault();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      helpPlan = null;
      power = Math.min(100, power + step);
      event.preventDefault();
    } else if (event.key === 'Home') {
      helpPlan = null;
      power = 10;
      event.preventDefault();
    } else if (event.key === 'End') {
      helpPlan = null;
      power = 100;
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      shoot(power);
      event.preventDefault();
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (canAim()) {
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      aimingStartedAt = performance.now();
      isHoldingAim = true;
    }
    updateAimFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.buttons !== 1 && event.pointerType === 'mouse') return;
    updateAimFromPointer(event);
  }

  function handlePointerUp() {
    if (!canAim()) return;
    aimAngle = displayAimAngle;
    resetAimDrag();
  }

  function shoot(selectedPower = power) {
    if (!cueBall || !canCharge()) return;
    isHoldingAim = false;
    closeSpinOverlay();
    power = selectedPower;
    const velocity = computeShotVelocity(aimAngle, selectedPower);
    if (Math.hypot(velocity.x, velocity.y) < 0.1) return;
    helpPlan = null;
    rollingPhysicsElapsedMs = 0;
    lastFrame = performance.now();
    beginPlayerReplay(selectedPower);
    contacts = [];
    artCueContacts = [];
    artCushionHits = [];
    artBlackHit = false;
    artWaypointsVisited = new Set<number>();
    artBallCollisions = 0;
    artShotSideSpin = spin;
    artShotVerticalSpin = verticalSpin;
    lastFoulPenalty = 0;
    opponentCueHitThisShot = false;
    pendingCueSpinResponses = [];
    activeCueSpinResponses = [];
    Body.setVelocity(cueBall, velocity);
    Body.setAngularVelocity(cueBall, -spin / CUE_SPIN_ANGULAR_SCALE);
    activeSpin = spin;
    activeVerticalSpin = verticalSpin;
    resetSpinTip();
    status = 'rolling';
    aimPoint = null;
    resetAimDrag();
  }

  function drawBall(ctx: CanvasRenderingContext2D, ball: DrawableBall) {
    const role = ball.billiardsRole;
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle =
      role === 'cue'
        ? '#faf9f1'
        : role === 'opponent'
          ? '#f1e8c8'
          : (ball.billiardsColor ?? (ball.billiardsId === 'red-1' ? '#dc342c' : '#bd1f26'));
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = role === 'cue' ? '#d8d0bc' : role === 'opponent' ? '#bda95f' : '#8e1518';
    ctx.stroke();
    if (role === 'cue') {
      ctx.beginPath();
      ctx.arc(
        ball.position.x - BALL_RADIUS * 0.3,
        ball.position.y - BALL_RADIUS * 0.3,
        BALL_RADIUS * 0.23,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
    } else if (role === 'opponent') {
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#315b91';
      ctx.fill();
    } else if (isPocketBall) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.font = `bold ${BALL_RADIUS * 0.8}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((ball.billiardsId ?? '').replace('pool-', ''), ball.position.x, ball.position.y);
    }
  }

  function drawPockets(ctx: CanvasRenderingContext2D) {
    if (!isPocketBall) return;
    for (const pocket of getPocketCenters()) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_DRAW_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#050807';
      ctx.fill();
    }
  }

  function drawPocketCushions(ctx: CanvasRenderingContext2D) {
    if (!isPocketBall) return;
    const geometry = getPocketRailGeometry();
    ctx.fillStyle = '#31533b';
    for (const jaw of geometry.jaws) {
      ctx.beginPath();
      ctx.moveTo(jaw.vertices[0].x, jaw.vertices[0].y);
      ctx.lineTo(jaw.vertices[1].x, jaw.vertices[1].y);
      ctx.lineTo(jaw.vertices[2].x, jaw.vertices[2].y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(240, 192, 90, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const rail of geometry.rails) {
      if (rail.side === 'top' || rail.side === 'bottom') {
        const y = rail.side === 'top' ? RAIL_THICKNESS : TABLE_HEIGHT - RAIL_THICKNESS;
        ctx.moveTo(rail.x - rail.width / 2, y);
        ctx.lineTo(rail.x + rail.width / 2, y);
      } else {
        const x = rail.side === 'left' ? RAIL_THICKNESS : TABLE_WIDTH - RAIL_THICKNESS;
        ctx.moveTo(x, rail.y - rail.height / 2);
        ctx.lineTo(x, rail.y + rail.height / 2);
      }
    }
    for (const jaw of geometry.jaws) {
      ctx.moveTo(jaw.face[0].x, jaw.face[0].y);
      ctx.lineTo(jaw.face[1].x, jaw.face[1].y);
    }
    ctx.stroke();
  }

  function drawArtGuides(ctx: CanvasRenderingContext2D) {
    if (!artMode) return;
    for (const [index, point] of currentArtStage.waypoints.entries()) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = artWaypointsVisited.has(index)
        ? 'rgba(98, 209, 120, 0.34)'
        : 'rgba(111, 225, 255, 0.2)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = artWaypointsVisited.has(index) ? '#8cf0a0' : '#bdefff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawAim(ctx: CanvasRenderingContext2D) {
    if (!cueBall || !canShowAimGuide()) return;
    const len = 58 + power * 1.05;
    const endX = cueBall.position.x + Math.cos(displayAimAngle) * len;
    const endY = cueBall.position.y + Math.sin(displayAimAngle) * len;
    const backX = cueBall.position.x - Math.cos(displayAimAngle) * 28;
    const backY = cueBall.position.y - Math.sin(displayAimAngle) * 28;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 236, 158, 0.88)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cueBall.position.x, cueBall.position.y);
    ctx.lineTo(backX, backY);
    ctx.stroke();
    if (aimPoint) {
      ctx.beginPath();
      ctx.arc(aimPoint.x, aimPoint.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.46)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHelpTrajectory(ctx: CanvasRenderingContext2D) {
    const trajectory = helpPlan?.trajectory;
    if (!trajectory || trajectory.length < 2 || status === 'rolling' || replaying) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(111, 225, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(trajectory[0].x, trajectory[0].y);
    for (let index = 1; index < trajectory.length; index += 1) {
      ctx.lineTo(trajectory[index].x, trajectory[index].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const end = trajectory[trajectory.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(111, 225, 255, 0.34)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 246, 255, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!canvasEl || !engine) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    ctx.fillStyle = '#163f2b';
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    ctx.fillStyle = '#267044';
    ctx.fillRect(
      RAIL_THICKNESS,
      RAIL_THICKNESS,
      TABLE_WIDTH - RAIL_THICKNESS * 2,
      TABLE_HEIGHT - RAIL_THICKNESS * 2
    );
    drawPockets(ctx);
    if (isPocketBall) {
      drawPocketCushions(ctx);
    } else {
      ctx.strokeStyle = '#d6b36a';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        RAIL_THICKNESS + 6,
        RAIL_THICKNESS + 6,
        TABLE_WIDTH - RAIL_THICKNESS * 2 - 12,
        TABLE_HEIGHT - RAIL_THICKNESS * 2 - 12
      );
    }
    drawArtGuides(ctx);

    const replayFrame = replaying ? lastPlayerReplay?.frames[replayFrameIndex] : null;
    if (replayFrame) {
      for (const ball of replayFrame.balls) {
        drawBall(ctx, {
          position: { x: ball.x, y: ball.y },
          billiardsRole: ball.role,
          billiardsId: ball.id,
          billiardsColor: ball.color
        });
      }
    } else {
      for (const ball of getTrackedBalls()) drawBall(ctx, ball);
    }
    drawAim(ctx);
    drawHelpTrajectory(ctx);
  }

  function keepBallsInsideTable() {
    for (const ball of getTrackedBalls()) {
      const next = (isPocketBall ? containBallInPocketTable : containBallInTable)({
        position: ball.position,
        velocity: ball.velocity
      });
      if (!next.corrected) continue;
      Body.setPosition(ball, next.position);
      Body.setVelocity(ball, next.velocity);
    }
  }

  function handlePocketedBalls() {
    if (!isPocketBall || !engine) return;
    for (const ball of [...getTrackedBalls()]) {
      if (!isBallInPocket(ball.position)) continue;
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
      Composite.remove(engine.world, ball);
      if (ball === cueBall) {
        cuePocketedThisShot = true;
        activeSpin = 0;
        activeVerticalSpin = 0;
        pendingCueSpinResponses = [];
        activeCueSpinResponses = [];
        continue;
      }
      redBalls = redBalls.filter((candidate) => candidate !== ball);
      remainingObjectCount = redBalls.length;
      pocketedThisShot += 1;
    }
  }

  function applyDynamicRollingDrag(delta: number) {
    for (const ball of getTrackedBalls()) {
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (Math.abs(ball.angularVelocity) <= ANGULAR_STOP_SPEED) {
        Body.setAngularVelocity(ball, 0);
      } else {
        Body.setAngularVelocity(ball, ball.angularVelocity * computeAngularVelocityScale(delta));
      }
      if (shouldSnapStoppedSpeed(speed) && !ballHasSpinResponse(ball)) {
        Body.setVelocity(ball, { x: 0, y: 0 });
        Body.setAngularVelocity(ball, 0);
        if (ball === cueBall) activeVerticalSpin = 0;
        continue;
      }
      const velocityScale = computeDynamicVelocityScale(speed, delta);
      Body.setVelocity(ball, {
        x: ball.velocity.x * velocityScale,
        y: ball.velocity.y * velocityScale
      });

      if (ball === cueBall && activeVerticalSpin !== 0) {
        activeVerticalSpin *= computeDynamicSpinDecay(speed, delta);
        if (Math.abs(activeVerticalSpin) < CUE_SPIN_STOP_VALUE) activeVerticalSpin = 0;
      }
    }
  }

  function advancePhysicsSlice(delta: number, physicsNow: number) {
    if (!engine) return;
    for (const obstacle of artMovingObstacles) {
      const offset = Math.sin(physicsNow * obstacle.speed) * obstacle.range;
      Body.setPosition(obstacle.body, {
        x: obstacle.origin.x + (obstacle.axis === 'x' ? offset : 0),
        y: obstacle.origin.y + (obstacle.axis === 'y' ? offset : 0)
      });
    }
    if (status === 'rolling') rollingPhysicsElapsedMs += delta;
    let remainingDelta = delta;
    for (let substep = 0; remainingDelta > 0.0001 && substep < PHYSICS_MAX_SUBSTEPS; substep += 1) {
      const collisionSpeed = computeMaxCollisionSpeed(getTrackedBalls());
      const remainingSubsteps = computePhysicsSubstepCount(collisionSpeed, remainingDelta);
      const substepDelta =
        substep === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / remainingSubsteps;
      Engine.update(engine, substepDelta);
      applyPendingRailResponses();
      activatePendingCueSpinResponses();
      advanceCueSpinResponses(substepDelta);
      handlePocketedBalls();
      keepBallsInsideTable();
      if (status === 'rolling') applyDynamicRollingDrag(substepDelta);
      remainingDelta = Math.max(0, remainingDelta - substepDelta);
    }

    if (artMode && status === 'rolling' && cueBall) {
      for (const [index, point] of currentArtStage.waypoints.entries()) {
        if (Math.hypot(cueBall.position.x - point.x, cueBall.position.y - point.y) <= 16) {
          artWaypointsVisited.add(index);
        }
      }
    }

    if (status === 'rolling' && cueBall && activeSpin !== 0) {
      const speed = Math.hypot(cueBall.velocity.x, cueBall.velocity.y);
      const adjustedVelocity = computeSpinAdjustedVelocity(
        cueBall.velocity,
        activeSpin,
        activeVerticalSpin,
        delta
      );
      if (
        speed > STOP_SPEED &&
        (adjustedVelocity.x !== cueBall.velocity.x || adjustedVelocity.y !== cueBall.velocity.y)
      ) {
        Body.setVelocity(cueBall, adjustedVelocity);
      }
      activeSpin *= computeDynamicSpinDecay(speed, delta);
      if (Math.abs(activeSpin) < CUE_SPIN_STOP_VALUE || speed <= STOP_SPEED) {
        activeSpin = 0;
        Body.setAngularVelocity(cueBall, 0);
      } else {
        Body.setAngularVelocity(cueBall, -activeSpin / CUE_SPIN_ANGULAR_SCALE);
      }
    }
  }

  function tick(now: number) {
    if (!engine) return;
    const elapsed = lastFrame ? now - lastFrame : PHYSICS_BASE_STEP_MS;
    lastFrame = now;
    const physicsSlices = computePhysicsFrameSlices(elapsed);
    const simulatedElapsed = physicsSlices.reduce((sum, slice) => sum + slice, 0);
    let physicsNow = now - simulatedElapsed;
    for (const delta of physicsSlices) {
      physicsNow += delta;
      advancePhysicsSlice(delta, physicsNow);
    }

    if (isHoldingAim && canAim()) {
      displayAimAngle = computeBreathingAimAngle(
        aimAngle,
        now - aimingStartedAt,
        now - aimingStartedAt
      );
    }

    if (status === 'rolling' && replayCapture) capturePlayerReplayFrame(now);

    if (replaying && lastPlayerReplay) {
      const elapsed = now - replayStartedAt;
      const frames = lastPlayerReplay.frames;
      for (let index = replayFrameIndex + 1; index < frames.length; index += 1) {
        if (frames[index].at > elapsed) break;
        replayFrameIndex = index;
      }
      const lastFrameAt = frames[frames.length - 1]?.at ?? 0;
      if (elapsed > lastFrameAt + 450) {
        replaying = false;
        replayFrameIndex = 0;
      }
    }

    if (
      status === 'rolling' &&
      (rollingPhysicsElapsedMs > MAX_ROLL_DURATION_MS ||
        (activeCueSpinResponses.length === 0 && stopped(getTrackedBalls(), STOP_SPEED)))
    ) {
      activeSpin = 0;
      rollingPhysicsElapsedMs = 0;
      settleShot();
    }

    draw();
    frameId = requestAnimationFrame(tick);
  }

  async function loadRank(mode: BilliardsRankingMode = rankingMode) {
    if (!isLoggedIn) return;
    rankLoading = true;
    try {
      const params = new URLSearchParams({ rank: '1', mode });
      const res = await fetch(`/games/billiards?${params.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      rankList = Array.isArray(body.rank) ? body.rank : [];
      myBestScore = typeof body.myBest?.score === 'number' ? body.myBest.score : null;
      todayStats = body.todayStats ?? { games: 0, users: 0 };
    } catch (error) {
      console.error('[billiards rank load failed]', error);
      todayStats = { games: 0, users: 0 };
    } finally {
      rankLoading = false;
    }
  }

  async function submitScore(mode: BilliardsRankingMode = currentMode, submittedScore = score) {
    if (!isLoggedIn || submittedGameOver) return;
    submittedGameOver = true;
    try {
      const res = await fetch('/games/billiards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          score: submittedScore
        })
      });
      if (res.ok && rankingMode === mode) await loadRank(mode);
    } catch (error) {
      console.error('[billiards score submit failed]', error);
    }
  }

  onMount(() => {
    if (!canvasEl) return;
    canvasEl.width = TABLE_WIDTH;
    canvasEl.height = TABLE_HEIGHT;
    engine = Engine.create({ gravity: { x: 0, y: 0 } });
    if (!restoreSavedGame()) resetBodies();

    const handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of event.pairs) {
        const railContact = getRailContact(pair.bodyA, pair.bodyB, pair.collision.normal);
        if (railContact) pendingRailContacts.push(railContact);
        queueActiveCueSpinContact(pair.bodyA as BallBody, pair.bodyB as BallBody);
        if (artMode) recordArtCollision(pair.bodyA, pair.bodyB);
        else recordCueContact(pair.bodyA as BallBody, pair.bodyB as BallBody);
      }
    };

    Events.on(engine, 'collisionStart', handleCollisionStart);

    if (
      !artMode &&
      currentMode === BILLIARDS_MODES.FOUR_BALL &&
      currentTurn === 'npc' &&
      status !== 'rolling' &&
      status !== 'game-over'
    ) {
      scheduleNpcShot(700);
    }

    void loadRank();
    autoSaveTimer = setInterval(saveGame, 750);
    window.addEventListener('pagehide', saveGame);
    frameId = requestAnimationFrame(tick);

    return () => {
      saveGame();
      window.removeEventListener('pagehide', saveGame);
      if (autoSaveTimer) clearInterval(autoSaveTimer);
      autoSaveTimer = null;
      if (autoSaveMessageTimer) clearTimeout(autoSaveMessageTimer);
      autoSaveMessageTimer = null;
      if (frameId) cancelAnimationFrame(frameId);
      if (npcTimer) clearTimeout(npcTimer);
      npcTimer = null;
      if (scoreEffectTimer) clearTimeout(scoreEffectTimer);
      scoreEffectTimer = null;
      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
    };
  });
</script>

<svelte:head>
  <title>{modeLabel} - dgst.me</title>
</svelte:head>

<div class="billiards-page">
  <section class="billiards-hud" aria-label="게임 상태">
    <div class="hud-title">
      <strong>{modeLabel}</strong>
      <span
        class:good={status === 'scored'}
        class:bad={status === 'game-over' || status === 'miss'}
      >
        {statusText}
      </span>
    </div>
    <div class="hud-stats">
      {#if artMode}
        <span>퍼즐 <strong>{artStageNumber}/10</strong></span>
        <span>최고 <strong>{myBestScore === null ? '-' : `${myBestScore}점`}</strong></span>
      {:else if isPocketBall}
        <span>점수 <strong>{score}</strong></span>
        <span>기회 <strong>{chances}</strong></span>
        <span>남은공 <strong>{remainingObjects}</strong></span>
        <span>최고 <strong>{myBestScore ?? '-'}</strong></span>
      {:else}
        <span>나 <strong>{score}</strong></span>
        <span>겐세이 형 <strong>{npcScore}</strong></span>
        <span>목표 <strong>{targetScore}</strong></span>
        {#if activeCombo > 0}
          <span>콤보 <strong>×{activeComboMultiplier}</strong></span>
        {/if}
      {/if}
    </div>
    <span class="auto-save-status" aria-live="polite">{autoSaveMessage}</span>
    <button type="button" class="new-game-button" onclick={newGame}>리셋</button>
  </section>

  <div class="mode-tabs" aria-label="당구 모드">
    <button
      type="button"
      class:active={!artMode && currentMode === BILLIARDS_MODES.FOUR_BALL}
      onclick={() => switchMode(BILLIARDS_MODES.FOUR_BALL)}
    >
      4구
    </button>
    <button
      type="button"
      class:active={!artMode && currentMode === BILLIARDS_MODES.POCKET_BALL}
      onclick={() => switchMode(BILLIARDS_MODES.POCKET_BALL)}
    >
      포켓볼
    </button>
    <button type="button" class:active={artMode} onclick={switchToArtMode}>예술구</button>
  </div>

  {#if artMode}
    <section class="art-stage-panel" aria-label="예술구 스테이지 선택">
      <div class="art-stage-toolbar">
        <button
          type="button"
          class="help-trigger"
          class:active={!!helpPlan}
          onclick={showShotHelp}
          disabled={status === 'rolling' || replaying}
        >
          {helpPlan ? '도움 닫기' : '도움'}
        </button>
        <div class="art-stages" aria-label="예술구 단계">
          {#each Array.from({ length: 10 }, (_, index) => index + 1) as stage (stage)}
            <button
              type="button"
              class:active={artStageNumber === stage}
              disabled={status === 'rolling'}
              onclick={() => selectArtStage(stage)}
            >
              {stage}
            </button>
          {/each}
        </div>
      </div>
      <div
        class="art-mission"
        class:success={artResult === 'success'}
        class:failed={artResult === 'failed'}
      >
        <strong>{currentArtStage.title}</strong>
        <span>{artResult === 'idle' ? currentArtStage.description : artResultMessage}</span>
      </div>
      {#if helpPlan}
        <div class="shot-help" aria-label="예술구 도움">
          <span>
            당점 {currentArtStage.solution.tipLabel} · 파워 약
            {Math.max(10, currentArtStage.solution.power - 5)}~{Math.min(
              100,
              currentArtStage.solution.power + 5
            )}
            · 점선은 대략적인 예상 궤적
          </span>
        </div>
      {/if}
    </section>
  {:else if !isPocketBall}
    <div class="target-selector" aria-label="4구 목표 점수와 NPC 난이도">
      <button
        type="button"
        class="help-trigger"
        class:active={!!helpPlan}
        onclick={showShotHelp}
        disabled={status === 'rolling' || npcThinking || replaying || helpThinking}
      >
        {helpThinking ? '계산…' : helpPlan ? '닫기' : '도움'}
      </button>
      {#each FOUR_BALL_TARGET_OPTIONS as option (option)}
        <button
          type="button"
          class:active={targetScore === option}
          disabled={status === 'rolling' || npcThinking}
          onclick={() => switchTargetScore(option)}
        >
          {option}
        </button>
      {/each}
    </div>
    {#if helpPlan}
      <div class="shot-help" aria-label="샷 도움">
        <span>
          중앙 당점 · 파워 약 {Math.max(10, helpPlan.power - 8)}~{Math.min(100, helpPlan.power + 8)}
          · {helpPlan.defensive ? '첫 적구를 노리는 길' : '득점 예상 길'}
        </span>
      </div>
    {/if}
  {/if}

  <section class="game-shell" aria-label={`${modeLabel} 게임`}>
    <main class="table-wrap">
      <canvas
        bind:this={canvasEl}
        class="billiards-canvas"
        aria-label={`${modeLabel} 당구대`}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
      ></canvas>
      {#if scoreEffect}
        {#key scoreEffect.id}
          <div class="score-effect {scoreEffect.tone}" role="status" aria-live="assertive">
            {scoreEffect.text}
          </div>
        {/key}
      {/if}
      {#if artMode && status === 'game-over'}
        <div
          class="art-result-layer"
          role="dialog"
          aria-modal="true"
          aria-label="예술구 결과"
          tabindex="-1"
        >
          <div class="art-result-card" class:success={artResult === 'success'}>
            <strong>{artResult === 'success' ? '클리어!' : '도전 실패'}</strong>
            <p>{artResultMessage}</p>
            {#if artScoreBreakdown}
              <strong class="art-score-total">{artScoreBreakdown.total}점</strong>
              <div class="art-score-breakdown" aria-label="예술구 점수 내역">
                <span>기본 {artScoreBreakdown.base}</span>
                <span
                  >{artScoreBreakdown.noHelp ? '무도움' : '도움 사용'} +{artScoreBreakdown.noHelp}</span
                >
                <span>시네루 +{artScoreBreakdown.spin}</span>
                <span>당점 +{artScoreBreakdown.control}</span>
                <span>쿠션 +{artScoreBreakdown.cushion}</span>
              </div>
            {/if}
            <div class="art-result-actions" class:single={artResult !== 'success'}>
              <button type="button" class="play-again-button" onclick={newGame}>다시 도전</button>
              {#if artResult === 'success'}
                <button type="button" class="next-stage-button" onclick={nextArtStage}
                  >다음 단계</button
                >
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </main>

    <aside class="bottom-controls" aria-label="당점과 파워">
      <div class="control-block tip-control">
        <span class="control-label">당점</span>
        <div
          class="tip-ball"
          role="button"
          tabindex="0"
          aria-label="당점"
          class:disabled-pad={!canSpin()}
          onpointerdown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            openSpinOverlay();
          }}
        >
          <div class="tip-cross horizontal"></div>
          <div class="tip-cross vertical"></div>
          <div
            class="tip-dot"
            style={`left: ${displayedSpinTipX + 50}%; top: ${50 - displayedSpinTipY}%;`}
          ></div>
        </div>
      </div>

      <div class="control-block power-control">
        <div class="power-heading">
          <span class="control-label">파워</span>
          <strong>{displayedPower}</strong>
        </div>
        <div
          class="power-rail"
          role="slider"
          tabindex="0"
          aria-label="샷 파워"
          aria-valuemin="10"
          aria-valuemax="100"
          aria-valuenow={displayedPower}
          class:disabled-pad={!canCharge()}
          onpointerdown={(event) => {
            event.stopPropagation();
            handlePowerPointerDown(event);
          }}
          onpointermove={(event) => {
            event.stopPropagation();
            if (event.buttons === 1 || event.pointerType === 'touch') updatePowerFromPointer(event);
          }}
          onkeydown={handlePowerKeyDown}
        >
          <div class="power-fill" style={`width: ${displayedPower}%;`}></div>
          <div class="power-thumb" style={`left: ${displayedPower}%;`}></div>
        </div>
        <button
          type="button"
          class="shot-button"
          onclick={() => shoot(power)}
          disabled={!canCharge()}
        >
          SHOT
        </button>
      </div>
    </aside>
  </section>

  {#if lastPlayerReplay}
    <div class="shot-review-actions" aria-label="마지막 샷 검토">
      <button
        type="button"
        onclick={startReplay}
        disabled={status === 'rolling' || npcThinking || replaying}
      >
        {replaying ? '재생 중…' : 'REPLAY'}
      </button>
      <button
        type="button"
        class="report-button"
        onclick={openReport}
        disabled={status === 'rolling' || npcThinking || replaying}
      >
        오류신고
      </button>
      <button
        type="button"
        class="share-button"
        onclick={openShare}
        disabled={status === 'rolling' || npcThinking || replaying}
      >
        게시판 공유
      </button>
      <span>
        {#if replaying}
          파워 {displayedPower} · 당점 좌우 {displayedSideSpin}, 상하 {displayedVerticalSpin}
        {:else}
          {lastPlayerReplay.outcome}
        {/if}
      </span>
    </div>
  {/if}

  {#if shareOpen && lastPlayerReplay}
    <div
      class="report-overlay"
      role="presentation"
      onpointerdown={(event) => {
        if (event.target === event.currentTarget) closeShare();
      }}
    >
      <form
        class="report-panel"
        aria-label="리플레이 게시판 공유"
        onsubmit={(event) => {
          event.preventDefault();
          void submitReplayShare();
        }}
      >
        <div class="report-heading">
          <strong>게시판에 리플레이 올리기</strong>
          <span>파워 {lastPlayerReplay.power}</span>
        </div>
        <label for="replay-share-board">게시판</label>
        <select id="replay-share-board" bind:value={shareBoard}>
          <option value="free">자유게시판</option>
          <option value="bug">버그신고</option>
        </select>
        <label for="replay-share-title">제목</label>
        <input id="replay-share-title" bind:value={shareTitle} maxlength="80" required />
        <label for="replay-share-note">내용 <small>(선택)</small></label>
        <textarea
          id="replay-share-note"
          bind:value={shareNote}
          maxlength="500"
          rows="4"
          placeholder="샷 설명을 적어주세요. 비워도 됩니다."
        ></textarea>
        <div class="report-actions">
          <button type="button" onclick={closeShare} disabled={shareSending}>취소</button>
          <button type="submit" disabled={shareSending}>
            {shareSending ? '올리는 중…' : '게시하기'}
          </button>
        </div>
      </form>
    </div>
  {/if}
  {#if reportMessage}
    <p
      class:report-error={reportMessage.includes('실패')}
      class="report-message"
      aria-live="polite"
    >
      {reportMessage}
    </p>
  {/if}

  {#if spinOverlayOpen}
    <div
      class="spin-overlay"
      role="presentation"
      onpointerdown={(event) => {
        if (event.target === event.currentTarget) closeSpinOverlay();
      }}
    >
      <div class="spin-panel" role="dialog" aria-modal="true" aria-label="당점 조절">
        <div class="spin-panel-heading">
          <span>당점</span>
          <strong>{spin} / {verticalSpin}</strong>
        </div>
        <div
          class="tip-ball expanded"
          role="slider"
          tabindex="0"
          aria-label="당점"
          aria-valuemin="-100"
          aria-valuemax="100"
          aria-valuenow={spin}
          aria-valuetext={`좌우 ${spin}, 상하 ${verticalSpin}`}
          onpointerdown={(event) => {
            event.stopPropagation();
            handleSpinPointerDown(event);
          }}
          onpointermove={(event) => {
            event.stopPropagation();
            if (event.buttons === 1 || event.pointerType === 'touch') updateSpinFromPointer(event);
          }}
        >
          <div class="tip-cross horizontal"></div>
          <div class="tip-cross vertical"></div>
          <div class="tip-dot" style={`left: ${spinTipX + 50}%; top: ${50 - spinTipY}%;`}></div>
        </div>
        <div class="spin-panel-actions">
          <button type="button" onclick={resetSpinTip}>초기화</button>
          <button type="button" onclick={closeSpinOverlay}>확인</button>
        </div>
      </div>
    </div>
  {/if}

  {#if reportOpen && lastPlayerReplay}
    <div
      class="report-overlay"
      role="presentation"
      onpointerdown={(event) => {
        if (event.target === event.currentTarget) closeReport();
      }}
    >
      <form
        class="report-panel"
        aria-label="이상한 샷 오류신고"
        onsubmit={(event) => {
          event.preventDefault();
          void submitShotReport();
        }}
      >
        <div class="report-heading">
          <strong>이상한 샷 신고</strong>
          <span>{lastPlayerReplay.outcome}</span>
        </div>
        <p>샷 궤적과 당점·파워가 자동 첨부됩니다.</p>
        <label for="shot-report-note">내용 <small>(선택)</small></label>
        <textarea
          id="shot-report-note"
          bind:value={reportNote}
          maxlength="500"
          rows="4"
          placeholder="어떤 움직임이 이상했는지 적어주세요. 비워도 됩니다."
        ></textarea>
        <div class="report-actions">
          <button type="button" onclick={closeReport} disabled={reportSending}>취소</button>
          <button type="submit" disabled={reportSending}>
            {reportSending ? '전송 중…' : '신고 보내기'}
          </button>
        </div>
      </form>
    </div>
  {/if}

  {#if status === 'game-over' && !artMode}
    <div class="game-over-actions">
      <button type="button" class="play-again-button" onclick={newGame}> 다시 치기 </button>
    </div>
  {/if}

  <section class="rank-panel">
    <div class="rank-heading">
      <h2>랭킹</h2>
      {#if rankLoading}<span>불러오는 중</span>{/if}
    </div>
    <div class="rank-mode-tabs" aria-label="당구 랭킹 모드">
      {#each rankingTabs as tab (tab.mode)}
        <button
          type="button"
          class:active={rankingMode === tab.mode}
          onclick={() => selectRankingMode(tab.mode)}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <p class="rank-today">
      오늘 참여 <strong>{todayStats.users}</strong>명 · 완료
      <strong>{todayStats.games}</strong>판
    </p>
    {#if rankList.length}
      <ol>
        {#each rankList as item (item._id ?? `${item.nickname}:${item.score}:${item.createdAt ?? ''}`)}
          <li>
            <span>{item.nickname}</span>
            <span class="rank-meta">
              <strong>{formatRankScore(item.score)}</strong>
              {#if item.createdAt}
                <small>{formatRelativeTime(item.createdAt, { locale: ko, addSuffix: true })}</small>
              {/if}
            </span>
          </li>
        {/each}
      </ol>
    {:else}
      <p>아직 기록이 없습니다.</p>
    {/if}
  </section>

  {#if !isLoggedIn}
    <p class="login-note">로그인하면 점수 랭킹을 저장합니다.</p>
  {/if}
</div>

<style>
  .billiards-page {
    width: min(100%, 520px);
    min-height: 100svh;
    margin: 0 auto;
    padding: 4px 6px 8px;
    color: #f8f5e8;
    position: relative;
  }

  .billiards-hud {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 32px;
    padding: 4px 6px;
    border-radius: 8px;
    background: rgba(6, 21, 16, 0.74);
    backdrop-filter: blur(4px);
  }

  .hud-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex: 1 1 190px;
    min-width: 0;
  }

  .hud-title strong {
    white-space: nowrap;
    font-size: 0.96rem;
    font-weight: 900;
  }

  .hud-title span {
    color: #d8e8d4;
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.15;
  }

  .hud-title .good {
    color: #ffe084;
  }

  .hud-title .bad {
    color: #ffb1a5;
  }

  .hud-stats {
    display: flex;
    flex: 1 1 170px;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    color: #b4ccb8;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .hud-stats strong {
    color: #f8f5e8;
    font-size: 0.9rem;
  }

  .auto-save-status {
    color: #9ec5a7;
    font-size: 0.66rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .new-game-button,
  .play-again-button,
  .next-stage-button,
  .shot-button,
  .spin-panel-actions button {
    border: 0;
    border-radius: 8px;
    font-weight: 900;
  }

  .new-game-button {
    min-height: 28px;
    padding: 0 10px;
    background: #f0c05a;
    color: #1d221a;
  }

  .mode-tabs {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: min(300px, calc(100% - 16px));
    margin: 6px auto 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(6, 21, 16, 0.74);
    backdrop-filter: blur(4px);
  }

  .mode-tabs button {
    min-height: 30px;
    border: 0;
    background: transparent;
    color: #d8e8d4;
    font-weight: 900;
  }

  .mode-tabs button.active {
    background: #f0c05a;
    color: #1d221a;
  }

  .art-stage-panel {
    display: grid;
    gap: 5px;
    width: min(430px, calc(100% - 8px));
    margin: -2px auto 8px;
  }

  .art-stage-toolbar {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 4px;
  }

  .art-stages {
    display: grid;
    gap: 4px;
    grid-template-columns: repeat(10, 1fr);
  }

  .art-stage-toolbar button {
    min-width: 0;
    min-height: 27px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    background: rgba(6, 21, 16, 0.76);
    color: #c9d9c7;
    font-size: 0.69rem;
    font-weight: 900;
  }

  .art-stage-toolbar button.active {
    border-color: #f0c05a;
    background: rgba(240, 192, 90, 0.2);
    color: #ffe39a;
  }

  .art-stage-toolbar > .help-trigger {
    border-color: rgba(111, 225, 255, 0.55);
    color: #bdefff;
  }

  .art-stage-toolbar > .help-trigger.active {
    background: rgba(111, 225, 255, 0.24);
    color: #e2faff;
  }

  .art-mission {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-height: 30px;
    padding: 6px 8px;
    border: 1px solid rgba(111, 225, 255, 0.3);
    border-radius: 7px;
    background: rgba(6, 21, 16, 0.76);
  }

  .art-mission strong {
    flex: 0 0 auto;
    color: #bdefff;
    font-size: 0.76rem;
  }

  .art-mission span {
    color: #d8e8d4;
    font-size: 0.7rem;
    line-height: 1.25;
  }

  .art-mission.success {
    border-color: rgba(98, 209, 120, 0.7);
  }

  .art-mission.failed {
    border-color: rgba(243, 107, 84, 0.7);
  }

  .target-selector {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    width: min(390px, calc(100% - 16px));
    margin: -2px auto 8px;
    gap: 4px;
  }

  .target-selector button {
    min-height: 28px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 7px;
    background: rgba(6, 21, 16, 0.76);
    color: #c9d9c7;
    font-size: 0.72rem;
    font-weight: 900;
  }

  .target-selector button.active {
    border-color: #f0c05a;
    background: rgba(240, 192, 90, 0.2);
    color: #ffe39a;
  }

  .target-selector .help-trigger {
    border-color: rgba(111, 225, 255, 0.44);
    color: #bdefff;
  }

  .target-selector .help-trigger.active {
    border-color: rgba(111, 225, 255, 0.72);
    background: rgba(111, 225, 255, 0.24);
    color: #d9f8ff;
  }

  .target-selector button:disabled {
    opacity: 0.55;
  }

  .shot-help {
    width: min(430px, calc(100% - 8px));
    min-height: 22px;
    margin: -3px auto 7px;
    text-align: center;
  }

  .shot-help span {
    min-width: 0;
    color: #bdefff;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .game-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-height: 0;
    padding-top: 0;
  }

  .bottom-controls {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    max-width: 430px;
  }

  .control-block {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(7, 31, 20, 0.72);
    padding: 6px;
  }

  .control-label {
    display: block;
    margin-bottom: 4px;
    color: #d8e8d4;
    font-size: 0.68rem;
    font-weight: 800;
    text-align: center;
  }

  .tip-ball {
    --tip-ball-size: 58px;
    position: relative;
    width: var(--tip-ball-size);
    height: var(--tip-ball-size);
    margin: 0 auto 5px;
    overflow: hidden;
    border: 2px solid #d8d0bc;
    border-radius: 50%;
    clip-path: circle(50% at 50% 50%);
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95), transparent 18%), #f8f7ef;
    box-shadow:
      inset 0 0 0 2px rgba(26, 33, 25, 0.18),
      0 4px 12px rgba(0, 0, 0, 0.28);
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }

  .tip-ball.expanded {
    --tip-ball-size: min(72vw, 238px);
    margin: 0 auto;
    box-shadow:
      inset 0 0 0 3px rgba(26, 33, 25, 0.2),
      0 18px 36px rgba(0, 0, 0, 0.34);
  }

  .tip-cross {
    position: absolute;
    background: rgba(180, 36, 38, 0.32);
    pointer-events: none;
  }

  .tip-cross.horizontal {
    left: 13%;
    right: 13%;
    top: calc(50% - 1px);
    height: 2px;
  }

  .tip-cross.vertical {
    top: 13%;
    bottom: 13%;
    left: calc(50% - 1px);
    width: 2px;
  }

  .tip-dot {
    position: absolute;
    width: 12px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #d9232e;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.86);
    pointer-events: none;
  }

  .tip-ball.expanded .tip-dot {
    width: 18px;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9);
  }

  .spin-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(6, 21, 16, 0.62);
    backdrop-filter: blur(6px);
  }

  .spin-panel {
    width: min(100%, 330px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    background: rgba(22, 63, 43, 0.96);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
    padding: 14px;
  }

  .spin-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    color: #f8f5e8;
    font-size: 0.95rem;
    font-weight: 900;
  }

  .spin-panel-heading strong {
    min-width: 42px;
    text-align: right;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .spin-panel-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 14px;
  }

  .spin-panel-actions button {
    min-height: 40px;
    background: rgba(255, 255, 255, 0.14);
    color: #f8f5e8;
  }

  .spin-panel-actions button:last-child {
    background: #f0c05a;
    color: #1d221a;
  }

  .control-block strong {
    display: block;
    text-align: center;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .table-wrap {
    position: relative;
    width: min(100%, calc((100svh - 166px) * 0.526316));
    max-width: 430px;
    aspect-ratio: 360 / 684;
    border: 4px solid #5d3b22;
    border-radius: 8px;
    background: #163f2b;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.36);
    overflow: hidden;
  }

  .billiards-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
  }

  .score-effect {
    position: absolute;
    z-index: 5;
    top: 42%;
    left: 50%;
    pointer-events: none;
    font-size: clamp(2rem, 10vw, 3.8rem);
    font-weight: 1000;
    line-height: 1;
    letter-spacing: -0.06em;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    animation: score-pop 2.5s cubic-bezier(0.16, 0.9, 0.28, 1) both;
    -webkit-text-stroke: 1px rgba(20, 16, 7, 0.5);
  }

  .art-result-layer {
    position: absolute;
    z-index: 7;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(2, 12, 8, 0.68);
    backdrop-filter: blur(3px);
  }

  .art-result-card {
    width: min(100%, 310px);
    padding: 18px;
    border: 1px solid rgba(255, 118, 95, 0.62);
    border-radius: 12px;
    background: rgba(12, 39, 27, 0.96);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
    text-align: center;
  }

  .art-result-card.success {
    border-color: rgba(98, 209, 120, 0.72);
  }

  .art-result-card > strong {
    color: #ffb1a5;
    font-size: 1.35rem;
    font-weight: 1000;
  }

  .art-result-card.success > strong {
    color: #9ee7ac;
  }

  .art-result-card .art-score-total {
    display: block;
    margin-bottom: 8px;
    color: #ffe084;
    font-size: 1.7rem;
  }

  .art-score-breakdown {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 14px;
  }

  .art-score-breakdown span {
    padding: 3px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: #d8e8d4;
    font-size: 0.66rem;
    font-weight: 900;
  }

  .art-result-card p {
    margin: 8px 0 14px;
    color: #d8e8d4;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .art-result-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .art-result-actions.single {
    grid-template-columns: 1fr;
  }

  .art-result-actions .play-again-button,
  .art-result-actions .next-stage-button {
    margin-top: 0;
  }

  .score-effect.score {
    color: #ffe169;
    text-shadow:
      0 3px 0 #a46000,
      0 8px 22px rgba(255, 214, 73, 0.62);
  }

  .score-effect.foul {
    color: #ff765f;
    text-shadow:
      0 3px 0 #781e16,
      0 8px 22px rgba(255, 73, 52, 0.66);
  }

  @keyframes score-pop {
    0% {
      opacity: 0;
      transform: translate(-50%, 25%) scale(0.45) rotate(-7deg);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -56%) scale(1.18) rotate(2deg);
    }
    35% {
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
    }
    72% {
      opacity: 1;
      transform: translate(-50%, -62%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -115%) scale(0.92);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .score-effect {
      animation: score-fade 2.5s ease-out both;
    }
  }

  @keyframes score-fade {
    0%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .power-rail {
    position: relative;
    width: 100%;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .power-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #69d17c, #f0c05a 58%, #f36b54);
    transition: width 80ms ease-out;
  }

  .power-thumb {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 38px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: #f8f5e8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
    transition: left 80ms ease-out;
  }

  .power-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 58px;
    grid-template-rows: auto 1fr;
    gap: 6px 8px;
    align-items: center;
  }

  .power-heading {
    grid-column: 1 / 2;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .power-heading .control-label {
    margin: 0;
  }

  .power-rail {
    grid-column: 1 / 2;
  }

  .shot-button {
    grid-column: 2 / 3;
    grid-row: 1 / 3;
    width: 100%;
    min-height: 62px;
    background: #f0c05a;
    color: #1d221a;
  }

  .disabled-pad,
  button:disabled {
    opacity: 0.5;
  }

  .play-again-button {
    width: 100%;
    min-height: 40px;
    margin-top: 8px;
    background: #f0c05a;
    color: #1d221a;
  }

  .game-over-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .next-stage-button {
    width: 100%;
    min-height: 40px;
    margin-top: 8px;
    background: #62d178;
    color: #112217;
  }

  .shot-review-actions {
    display: grid;
    grid-template-columns: 82px 82px 96px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    margin-top: 7px;
  }

  .shot-review-actions button,
  .report-actions button {
    min-height: 34px;
    border: 1px solid rgba(240, 192, 90, 0.45);
    border-radius: 8px;
    background: rgba(240, 192, 90, 0.14);
    color: #ffe39a;
    font-weight: 900;
  }

  .shot-review-actions .report-button {
    border-color: rgba(255, 153, 133, 0.45);
    background: rgba(255, 118, 92, 0.13);
    color: #ffc1b5;
  }

  .shot-review-actions .share-button {
    border-color: rgba(111, 225, 255, 0.45);
    background: rgba(59, 175, 207, 0.13);
    color: #bdefff;
  }

  .shot-review-actions span {
    overflow: hidden;
    color: #b4ccb8;
    font-size: 0.74rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-message {
    margin: 5px 2px 0;
    color: #9ee7ac;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: center;
  }

  .report-message.report-error {
    color: #ffb1a5;
  }

  .report-overlay {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(1, 7, 5, 0.78);
    backdrop-filter: blur(4px);
  }

  .report-panel {
    display: grid;
    width: min(100%, 420px);
    gap: 8px;
    padding: 16px;
    border: 1px solid rgba(240, 192, 90, 0.32);
    border-radius: 12px;
    background: #102d21;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.48);
  }

  .report-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .report-heading span,
  .report-panel p,
  .report-panel label small {
    color: #b4ccb8;
    font-size: 0.78rem;
  }

  .report-panel p {
    margin: 0;
  }

  .report-panel label {
    font-size: 0.82rem;
    font-weight: 900;
  }

  .report-panel textarea,
  .report-panel input,
  .report-panel select {
    width: 100%;
    resize: vertical;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    padding: 10px;
    background: rgba(4, 16, 11, 0.74);
    color: #f8f5e8;
    font: inherit;
  }

  .report-panel select {
    min-height: 42px;
  }

  .report-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .report-actions button[type='submit'] {
    background: #f0c05a;
    color: #1d221a;
  }

  h2 {
    margin: 0;
    line-height: 1.1;
  }

  .rank-panel {
    margin-top: 10px;
    padding: 10px;
    border-radius: 8px;
    background: rgba(9, 30, 22, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .rank-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .rank-mode-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 8px;
  }

  .rank-mode-tabs button {
    min-height: 30px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 7px;
    background: rgba(4, 16, 11, 0.6);
    color: #c9d9c7;
    font-weight: 900;
  }

  .rank-mode-tabs button.active {
    border-color: #f0c05a;
    background: rgba(240, 192, 90, 0.2);
    color: #ffe39a;
  }

  .rank-heading h2 {
    font-size: 1rem;
  }

  .rank-heading span,
  .rank-panel p,
  .login-note {
    color: #b4ccb8;
    font-size: 0.86rem;
  }

  .rank-panel ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rank-panel li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .rank-panel li:first-child {
    border-top: 0;
  }

  .rank-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    white-space: nowrap;
  }

  .rank-meta small {
    color: #b4ccb8;
    font-size: 0.74rem;
  }

  .login-note {
    margin: 8px 0 0;
    text-align: center;
  }

  @media (max-width: 420px) {
    .billiards-page {
      width: 100%;
      padding: 4px;
    }

    .billiards-hud {
      flex-wrap: wrap;
      min-height: 30px;
    }

    .bottom-controls {
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 6px;
    }

    .table-wrap {
      width: min(100%, calc((100svh - 188px) * 0.526316));
    }

    .power-rail {
      height: 28px;
    }

    .shot-button {
      min-height: 58px;
    }

    .login-note {
      display: none;
    }

    .rank-panel {
      margin-top: 6px;
      padding: 8px;
    }

    .rank-panel ol {
      display: grid;
      grid-template-columns: 1fr;
    }

    .rank-panel li {
      padding: 5px 0;
      font-size: 0.82rem;
    }
  }
</style>
