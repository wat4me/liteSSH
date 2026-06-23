import { ref, nextTick } from 'vue'
import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'

export function useTerminalSearch(deps: {
  getTerminal: () => Terminal | null
  getSearchAddon: () => SearchAddon | null
}) {
  const searchVisible = ref(false)
  const searchQuery = ref('')
  let searchInputRef: HTMLInputElement | null = null

  function setSearchInputRef(el: HTMLInputElement | null) {
    searchInputRef = el
  }

  function toggleSearch() {
    searchVisible.value = !searchVisible.value
    if (searchVisible.value) {
      searchQuery.value = ''
      nextTick(() => {
        searchInputRef?.focus()
        searchInputRef?.select()
      })
    } else {
      deps.getSearchAddon()?.clearDecorations()
      deps.getTerminal()?.focus()
    }
  }

  function doSearch(query: string) {
    const searchAddon = deps.getSearchAddon()
    if (!searchAddon || !query) {
      searchAddon?.clearDecorations()
      return
    }
    searchAddon.findNext(query, {
      decorations: {
        matchBackground: '#ffb80066',
        activeMatchBackground: '#ffb80099',
        matchBorder: '#ffb800',
        activeMatchBorder: '#ff8c00',
        matchOverviewRuler: '#ffb800',
        activeMatchColorOverviewRuler: '#ff8c00',
      },
    })
  }

  function onSearchInput() {
    doSearch(searchQuery.value)
  }

  function onSearchKeydown(e: KeyboardEvent) {
    const searchAddon = deps.getSearchAddon()
    if (e.key === 'Enter') {
      e.preventDefault()
      searchAddon?.findNext(searchQuery.value)
    } else if (e.key === 'Escape') {
      toggleSearch()
    }
  }

  function closeSearch() {
    if (searchVisible.value) {
      toggleSearch()
    }
  }

  return {
    searchVisible,
    searchQuery,
    setSearchInputRef,
    toggleSearch,
    doSearch,
    onSearchInput,
    onSearchKeydown,
    closeSearch,
  }
}
