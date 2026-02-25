const isMarkdownContent = (text) => {
  if (!text) return false;
  return /(^#{1,6}\s+|^\s*[-*+]\s+|^>\s+|^\d+\.\s+|`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\))/m.test(text);
};

const text = `“마크다운 자체”는 텍스트라서 안전해 보이지만, **웹에서 유저가 입력한 마크다운을 렌더링해서 보여줄 거라면 소독( sanitization )이 필요합니다.**[1][2][3][4][5][6]

***

## 왜 소독이 필요한가

- 대부분의 마크다운 구현은 **임베디드 HTML을 허용**합니다.  

Sources
[1] Secure Markdown Rendering in React https://www.hackerone.com/blog/secure-markdown-rendering-react-balancing-flexibility-and-safety`;

console.log('Result:', isMarkdownContent(text));
