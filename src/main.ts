import "./style.css";
import { mount } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("找不到 #app");
mount(root);
