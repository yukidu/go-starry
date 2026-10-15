import { styles as baseStyles } from "./uiV11";

export const styles = `${baseStyles}
/* v12：漢堡選單開啟時，除選單外全頁套用深色模糊遮罩 */
.menu-overlay{
  inset:0;
  background:rgba(15,23,42,.8);
  backdrop-filter:blur(4px);
  -webkit-backdrop-filter:blur(4px);
}
@media (prefers-color-scheme:dark){
  .menu-overlay{background:rgba(3,8,18,.8)}
}
`;
