"use client"
import { useEffect } from "react"

const enhanced = new WeakSet<HTMLSelectElement>()

function enhance(select: HTMLSelectElement) {
  if (enhanced.has(select) || select.closest(".custom-select-wrap")) return
  enhanced.add(select)
  const wrap = document.createElement("div")
  wrap.className = "custom-select-wrap"
  select.parentNode?.insertBefore(wrap, select)
  wrap.appendChild(select)
  const button = document.createElement("button")
  button.type = "button"
  button.className = "custom-select-trigger"
  button.setAttribute("aria-haspopup", "listbox")
  const menu = document.createElement("div")
  menu.className = "custom-select-menu"
  menu.setAttribute("role", "listbox")
  const sync = () => {
    const option = select.options[select.selectedIndex]
    button.textContent = option?.text || "Choose an option"
    button.disabled = select.disabled
    button.setAttribute("aria-expanded", "false")
    menu.querySelectorAll<HTMLElement>("[role=option]").forEach(item => item.setAttribute("aria-selected", item.dataset.value === select.value ? "true" : "false"))
  }
  const rebuild = () => {
    menu.innerHTML = ""
    Array.from(select.options).forEach(option => {
      const item = document.createElement("button")
      item.type = "button"
      item.className = "custom-select-option"
      item.setAttribute("role", "option")
      item.dataset.value = option.value
      item.textContent = option.text
      item.disabled = option.disabled
      item.onclick = () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
        setter?.call(select, option.value)
        select.dispatchEvent(new Event("change", { bubbles: true }))
        sync()
        menu.classList.remove("open")
      }
      menu.appendChild(item)
    })
    sync()
  }
  const placeMenu = () => {
    const rect = button.getBoundingClientRect()
    const roomBelow = window.innerHeight - rect.bottom
    const openUpward = roomBelow < 190 && rect.top > roomBelow
    menu.style.position = "fixed"
    menu.style.left = `${Math.max(8, rect.left)}px`
    menu.style.right = "auto"
    menu.style.width = `${Math.min(rect.width, window.innerWidth - Math.max(8, rect.left) - 8)}px`
    menu.style.maxHeight = `${Math.max(110, Math.min(240, (openUpward ? rect.top : roomBelow) - 14))}px`
    if (openUpward) {
      menu.style.top = "auto"
      menu.style.bottom = `${window.innerHeight - rect.top + 6}px`
    } else {
      menu.style.top = `${rect.bottom + 6}px`
      menu.style.bottom = "auto"
    }
  }
  button.onclick = event => {
    event.stopPropagation()
    document.querySelectorAll<HTMLElement>(".custom-select-menu.open").forEach(item => item !== menu && item.classList.remove("open"))
    menu.classList.toggle("open")
    if (menu.classList.contains("open")) placeMenu()
    button.setAttribute("aria-expanded", menu.classList.contains("open") ? "true" : "false")
  }
  select.addEventListener("change", sync)
  wrap.append(button, menu)
  rebuild()
  const observer = new MutationObserver(rebuild)
  observer.observe(select, { childList: true, subtree: true, attributes: true })
  window.addEventListener("resize", () => menu.classList.contains("open") && placeMenu())
}

export default function CustomSelects() {
  useEffect(() => {
    const scan = () => document.querySelectorAll<HTMLSelectElement>("select").forEach(enhance)
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    const close = () => document.querySelectorAll<HTMLElement>(".custom-select-menu.open").forEach(menu => menu.classList.remove("open"))
    document.addEventListener("click", close)
    return () => { observer.disconnect(); document.removeEventListener("click", close) }
  }, [])
  return null
}
