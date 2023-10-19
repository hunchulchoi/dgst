<script>
  import { page } from '$app/stores';

  import basex from 'base-x';

  const b58 = basex('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');

  console.log('$page.data.session', $page.data.session);

  const array = [
      '8pljdvk93rbpuwoigiyo1ujaypm/7jwrqtc6g+xp2htq+d3fl816ot62qy3f9d4h/klkrpjqjexcvxfgtbjzdg==',
      'pm8dcwnk3tembt8/gbgauhmo5owgjf45wdzmuuncy1rshmxhz5qvp3lu+nmqmbmdvjm+bhcdwvkdxxku8saucw==',
      'honmtaqnq+yxjc9twz6fftvdwuqv2auckd/8xw7nw5+jh+tvo2qcwvnsaixrfpaguys6o9kf+afs6cpyc/kriq==',
      's3aiextsgi2x9rtwycemz9njl0p4jddhr3zgo6vfh4so89zpc1yae249d3sx7v0fpx/9he5w/kyhn7yqk4giwq==',
      'jk9pzawcrpq299i6ooasvpf0qj2v/tveencjgctexem2eid4rf1fg+jkqjtbuiu8b6dw20usv6f2lcyqfjpqwg==',
      'b1ns6ewceyn0m6ueqzihypll62/pxbz5ksewhb/ematkwp3gg98ztxdvt3pggqvk5d+i9gqt9216k3ykkcpwia==',
      'zlhnkf+9aespmvxpphwzbwu7wgjyoe7nxt8qkn+ifjgyrpe00r3iru3otne4uk9tffuykkk4jyqwywwoanfnra==',
      '+tcfmvxdvbvy+lzrdclkrgkeupmkhoti17ki04ienhp9jd3kc05nggzpns8xjb37q6qhgprt74ookw4wzf7hbq==',

  ]

</script>

<h1>protected</h1>

{#each array as item}
<div>{item}({item.length})</div>
<div>{Buffer.from(item).toString('base64url')}({Buffer.from(item).toString('base64url').length})</div>
{/each}


