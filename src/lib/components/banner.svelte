<script>
import { Offcanvas } from '@sveltestrap/sveltestrap';
import {Confetti} from 'svelte-confetti';

import ccd from '$lib/shared/stores/ccd.js';

ccd.set(true);

const bannerContent =
  `🌸<span class="text-danger">경)</span> 🎉해운대⛱️ 삼익비치의 딸🍾 공기업❤️ 취직🎊 <span class="text-danger">(축</span>🌼`
</script>

<Offcanvas isOpen={$ccd}
           toggle={()=>ccd.set(false)}
           fade={true}
           class="text-center text-dark rounded-bottom-4 pb-3"
           style="background: linear-gradient(90deg, rgba(211,209,247,1) 0%, rgba(150,150,146,1) 70%, rgba(111,112,101,1) 100%);"
           placement="top">
  <div class="neon">{@html bannerContent}
  <div style="
 position: fixed;
 top: -50px;
 left: 0;
 height: 100vh;
 width: 100vw;
 display: flex;
 justify-content: center;
 overflow: hidden;
 pointer-events: none;">
    <Confetti x={[-5, 5]} y={[0, 0.1]} delay={[500, 2000]} infinite duration=5000 amount=200 fallDistance="100vh" />
  </div>
</Offcanvas>

<style>
    .neon {
        font-family: 'ChosunGs',serif;
        font-size: 2.2em;
        /*font-weight: 700;*/
        color: #fff;
        text-shadow: 0 0 0.1em rgba(0, 255, 255, 0.7);
        animation: neon-flicker 0.1s infinite alternate;
    }
    @keyframes neon-flicker {
        0% {
            text-shadow:
                    0 0 10px rgba(0, 255, 255, 0.7),
                    0 0 20px rgba(0, 255, 255, 0.7),
                    0 0 30px rgba(0, 255, 255, 0.7);
        }
        100% {
            text-shadow:
                    0 0 20px rgba(0, 255, 255, 0.7),
                    0 0 30px rgba(0, 255, 255, 0.7),
                    0 0 40px rgba(0, 255, 255, 0.7);
        }
    }

    @font-face {
        font-family: 'ChosunGs';
        src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunGs.woff') format('woff');
        font-weight: normal;
        font-style: normal;
    }
</style>
