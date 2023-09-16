<script>
  import {
    Navbar,
    NavbarBrand,
    Image,
    Nav,
    NavItem,
    NavLink,
    Icon,
    Styles,
    Dropdown,
    DropdownToggle,
    DropdownItem, Collapse, NavbarToggler, DropdownMenu
  } from "sveltestrap";

  import theme from "$lib/shared/stores/theme.js";

  let isOpen = false;

  function handleUpdate(event){
 console.log(event)
    isOpen = event.detail.isOpen;
  }

  console.log($theme)
</script>

<Styles theme={$theme}/>

<Navbar expand="md" class="m-1 rounded shadow fs-5 text-secondary" style="background-color: #fafae4">
  <NavbarBrand href="/" class="p-0">
    <Image fluid alt="dgst logo" src="/logo/logo_transparent_100.png" class="p-0" style="height: 50px"/>
  </NavbarBrand>
  <NavbarToggler on:click={()=>(isOpen = !isOpen)}/>
  <Collapse {isOpen} navbar expand="md" on:update={handleUpdate}>
    <Nav class="ms-auto" navbar>
      <NavItem>
        <NavLink><Icon name="unlock-fill"/> 로그인</NavLink>
      </NavItem>
     <Dropdown nav inNavbar>
       <DropdownToggle nav caret></DropdownToggle>
       <DropdownMenu end>
         <DropdownItem><Icon name="circle-half"/> 자동</DropdownItem>
         <DropdownItem divider/>
         <DropdownItem on:click={()=>theme.set('light')}><Icon name="sun-fill"/> 밝게</DropdownItem>
         <DropdownItem on:click={()=>theme.set('dark')}><Icon name="moon-stars-fill"/> 어둡게</DropdownItem>
       </DropdownMenu>
     </Dropdown>
    </Nav>
  </Collapse>
</Navbar>
