<script>
  import SeotdaReplayPlayer from '$lib/components/SeotdaReplayPlayer.svelte';

  const replay = {
    version: 1,
    result: '승리',
    ante: 1000,
    finalPot: 22000,
    note: '아귀의 뻥카를 잡아낸 한 판',
    seats: [
      {
        id: 'user',
        name: '나',
        chips: 112000,
        folded: false,
        winner: true,
        handName: '알리',
        cards: [
          { month: 1, gwang: false },
          { month: 2, gwang: false }
        ]
      },
      {
        id: 'npc_goni',
        name: '고니',
        chips: 87000,
        folded: true,
        winner: false,
        handName: '망통',
        cards: [
          { month: 2, gwang: false },
          { month: 8, gwang: false }
        ]
      },
      {
        id: 'npc_jungmadam',
        name: '정마담',
        chips: 94000,
        folded: true,
        winner: false,
        handName: '한끗',
        cards: [
          { month: 4, gwang: false },
          { month: 7, gwang: false }
        ]
      },
      {
        id: 'npc_agwi',
        name: '아귀',
        chips: 76000,
        folded: false,
        winner: false,
        handName: '갑오',
        cards: [
          { month: 4, gwang: false },
          { month: 5, gwang: false }
        ]
      }
    ],
    events: [
      { type: 'deal', seatId: null, text: '패를 돌립니다', amount: 0, potAfter: 0 },
      { type: 'ante', seatId: null, text: '판돈 1,000점', amount: 4000, potAfter: 4000 },
      {
        type: 'action',
        seatId: 'npc_goni',
        text: '고니: 콜 (1,000)',
        amount: 1000,
        potAfter: 5000
      },
      {
        type: 'action',
        seatId: 'npc_jungmadam',
        text: '정마담: 다이',
        amount: 0,
        potAfter: 5000
      },
      {
        type: 'action',
        seatId: 'npc_agwi',
        text: '아귀: 레이즈! (5,000)',
        amount: 5000,
        potAfter: 10000
      },
      {
        type: 'taunt',
        seatId: 'npc_agwi',
        text: '아귀: “내가 빙다리 핫바지로 보이냐?”',
        amount: 0,
        potAfter: 10000
      },
      {
        type: 'action',
        seatId: 'user',
        text: '나: 레이즈 (6,000)',
        amount: 6000,
        potAfter: 16000
      },
      {
        type: 'taunt',
        seatId: 'npc_goni',
        text: '고니: “확실하지 않으면 승부를 걸지 마라.”',
        amount: 0,
        potAfter: 16000
      },
      {
        type: 'action',
        seatId: 'npc_goni',
        text: '고니: 다이',
        amount: 0,
        potAfter: 16000
      },
      {
        type: 'action',
        seatId: 'npc_agwi',
        text: '아귀: 콜 (6,000)',
        amount: 6000,
        potAfter: 22000
      },
      { type: 'showdown', seatId: null, text: '패 공개', amount: 0, potAfter: 22000 },
      { type: 'result', seatId: 'user', text: '나 승리! 알리', amount: 0, potAfter: 22000 }
    ],
    ddaeng: null
  };
</script>

<svelte:head>
  <title>섯다 리플레이 테스트</title>
</svelte:head>

<main>
  <h1>섯다 게시판 리플레이 테스트</h1>
  <SeotdaReplayPlayer {replay} />
</main>

<style>
  :global(body) {
    margin: 0;
    background: #161b18;
  }

  main {
    min-height: 100vh;
    padding: 1rem;
  }

  h1 {
    margin: 0 auto 1rem;
    color: #f7f3df;
    font-size: 1.1rem;
    text-align: center;
  }
</style>
