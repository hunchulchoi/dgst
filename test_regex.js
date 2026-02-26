const html = '<pre><code class="language-javascript"><span class="what">hey</span></code></pre>';
console.log(html.replace(/<pre><code class="([^"]+)">/g, '<pre class="$1"><code class="$1">'));
