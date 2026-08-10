<script>
  import { Col, Row } from '$lib/components/ui/index.js';
  import { resolve } from '$app/paths';
</script>

<footer class="site-footer-chrome mt-4">
  <Row class="mx-0 mb-3">
    <Col class="p-2 border-top border-secondary-subtle text-center">
      <div
        class="footer-brand-line d-inline-flex flex-row flex-nowrap align-items-center justify-content-center gap-2 text-muted"
      >
        <img
          alt="dgst logo"
          src="/logo/logo_transparent_100.png"
          class="p-0"
          style="height: 24px"
        />
        <span class="!text-sm">© 2023</span>
        <span aria-hidden="true">·</span>
        <a class="!text-sm text-muted" href={resolve('/privacy')}>개인정보처리방침</a>
      </div>
    </Col>
  </Row>
</footer>
