/**
 * Story Manager Class - Based on working BlogManager
 * Handles loading, filtering, and displaying Telugu stories from Google Docs
 */
class StoryManager {
  constructor() {
    // Configuration
    this.DOC_ID = "1SFgN6XxrcPqRLEMfZVcts0ix6y4Wnnp2yICgPnlz0JI"
    this.postsPerPage = 6

    // DOM Elements
    this.elements = {
      storiesContainer: document.getElementById("storiesContainer"),
      loadingSpinner: document.getElementById("loadingSpinner"),
      errorMessage: document.getElementById("errorMessage"),
      loadMoreBtn: document.getElementById("loadMoreBtn"),
      categoryFilters: document.getElementById("categoryFilters"),
      printButton: document.getElementById("printButton"),
      searchInput: document.getElementById("searchInput"),
      homePage: document.getElementById("homePage"),
      storyPage: document.getElementById("storyPage"),
      storyContent: document.getElementById("storyContent"),
      storyLoadingSpinner: document.getElementById("storyLoadingSpinner"),
      navbarToggle: document.getElementById("navbarToggle"),
      navbarMenu: document.getElementById("navbarMenu"),
    }

    // State
    this.state = {
      currentPage: 1,
      allStories: [],
      filteredStories: [],
      displayedStories: [],
      currentView: "home",
      categories: new Set(),
      activeCategory: null,
      searchTerm: "",
      isLoading: false,
    }

    this.init()
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      this.setupEventListeners()
      this.setupBrowserNavigation()
      await this.loadStories()
      this.updateStats()

      // Check URL parameters after stories are loaded
      this.handleInitialNavigation()
    } catch (error) {
      console.error("Initialization error:", error)
      this.showError("Failed to initialize the application")
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Navigation toggle
    this.elements.navbarToggle?.addEventListener("click", () => {
      this.elements.navbarMenu.classList.toggle("active")
    })

    // Load more button
    this.elements.loadMoreBtn?.addEventListener("click", () => {
      this.loadMoreStories()
    })

    // Print button
    this.elements.printButton?.addEventListener("click", () => {
      window.print()
    })

    // Search input with debouncing
    this.elements.searchInput?.addEventListener(
      "input",
      this.debounce((e) => {
        this.state.searchTerm = e.target.value.toLowerCase()
        this.state.currentPage = 1
        this.filterAndRenderStories()
      }, 300),
    )

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        e.preventDefault()
        const targetId = anchor.getAttribute("href").slice(1)
        const targetElement = document.getElementById(targetId)
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth" })
        }
      })
    })

    // Close mobile menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".navbar") && this.elements.navbarMenu.classList.contains("active")) {
        this.elements.navbarMenu.classList.remove("active")
      }
    })
  }

  /**
   * Set up browser navigation handling
   */
  setupBrowserNavigation() {
    window.addEventListener("popstate", (event) => {
      if (event.state) {
        if (event.state.view === "story" && event.state.storyId) {
          this.navigateToView("story", event.state.storyId, false)
        } else {
          this.showHomePage(false)
        }
      } else {
        this.showHomePage(false)
      }
    })
  }

  /**
   * Handle initial navigation based on URL parameters
   */
  handleInitialNavigation() {
    const urlParams = new URLSearchParams(window.location.search)
    const storyId = urlParams.get("story")

    if (storyId) {
      console.log("Initial navigation to story:", storyId)
      // Wait a bit to ensure DOM is ready
      setTimeout(() => {
        this.navigateToView("story", storyId, false)
      }, 100)
    }
  }

  /**
   * Get Google Docs URL with CORS proxy
   */
  getDocUrl() {
    const corsProxies = [
      "https://api.allorigins.win/raw?url=",
      "https://thingproxy.freeboard.io/fetch/",
      "https://proxy.cors.sh/",
    ]
    const googleDocsExportUrl = `https://docs.google.com/document/d/${this.DOC_ID}/export?format=html`
    return `${corsProxies[0]}${encodeURIComponent(googleDocsExportUrl)}`
  }

  /**
   * Load stories from Google Docs using the working approach
   */
  async loadStories() {
    this.showLoading()
    let proxyIndex = 0

    while (proxyIndex < 3) {
      try {
        const response = await fetch(this.getDocUrl())
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const html = await response.text()
        if (!html || html.trim().length === 0) {
          throw new Error("Empty response received")
        }

        this.state.allStories = this.parseStoriesFromDoc(html)
        console.log("Stories before filtering:", this.state.allStories)

        // Filter valid stories
        this.state.allStories = this.state.allStories.filter((story) => {
          if (!story) return false

          // Ensure title exists
          if (!story.title || !story.title.trim()) {
            story.title = "Untitled Story"
          }

          // Ensure we have some content
          return story.content && story.content.trim().length > 0
        })

        console.log("Stories after filtering:", this.state.allStories)

        if (this.state.allStories.length === 0) {
          console.log("All stories were filtered out. Check the parsing logic.")
          throw new Error("No valid stories found in the document")
        }

        // Extract categories
        this.state.categories = new Set()
        this.state.allStories.forEach((story) => {
          if (story.category) {
            this.state.categories.add(story.category)
          }
        })

        this.createCategoryFilters()
        this.filterAndRenderStories()
        this.hideLoading()
        return
      } catch (error) {
        console.error(`Error with proxy ${proxyIndex}:`, error)
        proxyIndex++

        if (proxyIndex >= 3) {
          this.showDocumentAccessError()
          this.hideLoading()
        }
      }
    }
  }

  /**
   * Parse stories from Google Docs HTML using the working method
   */
  parseStoriesFromDoc(html) {
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = html

    // Remove Google Docs styling
    const styles = tempDiv.getElementsByTagName("style")
    Array.from(styles).forEach((style) => style.remove())

    // Get the main content
    const content = tempDiv.querySelector("body") || tempDiv

    console.log("Raw content:", content.innerHTML.substring(0, 500) + "...")

    // Split content by horizontal rules and process each section
    const sections = content.innerHTML.split(/<hr[^>]*>/i)
    const storyBlocks = []

    sections.forEach((section) => {
      if (!section.trim()) return // Skip empty sections

      const blockDiv = document.createElement("div")
      blockDiv.innerHTML = section

      const storyContent = []
      let foundTitle = false

      // Process each element in the section
      Array.from(blockDiv.children).forEach((el) => {
        const text = el.textContent.trim()
        if (!text) return

        // Check if it's a heading and we haven't found a title yet
        if (!foundTitle && el.tagName.match(/^H[1-6]$/)) {
          storyContent.unshift(`Title: ${text}`) // Add title at the beginning
          foundTitle = true
        } else {
          storyContent.push(text)
        }
      })

      // Only add non-empty stories
      if (storyContent.length > 0) {
        storyBlocks.push(storyContent.join("\n"))
      }
    })

    console.log("Story blocks:", storyBlocks)

    return storyBlocks
      .map((block, index) => this.parseStoryBlock(block, index + 1))
      .filter((story) => story)
      .reverse()
  }

  /**
   * Parse individual story block using the working method
   */
  parseStoryBlock(block, id) {
    console.log("Parsing block:", block.substring(0, 100) + "...")

    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line)
    const story = { id }

    // Initialize default values
    story.title = ""
    story.date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    story.category = "General"
    story.author = "Maharshi Ramana"

    let contentStartIndex = 0
    let foundMetadata = false

    // Try to find a title first (either as metadata or as first line)
    const titleMatch = block.match(/Title:\s*(.+?)(?:\n|$)/)
    if (titleMatch) {
      story.title = titleMatch[1].trim()
      foundMetadata = true
    }

    // Look for metadata at the start of the block
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i]
      if (line.match(/^(Title|కథ):(.+)/i)) {
        story.title = line.replace(/^(Title|కథ):/i, "").trim()
        contentStartIndex = i + 1
        foundMetadata = true
      } else if (line.match(/^(Date|తేదీ):(.+)/i)) {
        story.date = line.replace(/^(Date|తేదీ):/i, "").trim()
        contentStartIndex = i + 1
        foundMetadata = true
      } else if (line.match(/^(Category|వర్గం):(.+)/i)) {
        story.category = line.replace(/^(Category|వర్గం):/i, "").trim()
        contentStartIndex = i + 1
        foundMetadata = true
      }
    }

    // If no metadata was found, treat the first line as title
    if (!foundMetadata && lines.length > 0) {
      story.title = lines[0]
      contentStartIndex = 1
    }

    // Get content, skipping known metadata lines
    const contentLines = lines.filter((line) => {
      return !line.match(/^(Title|కథ|Date|తేదీ|Category|వర్గం):/i)
    })

    // If no metadata was found but we have lines, use first line as title
    if (!foundMetadata && contentLines.length > 0 && !story.title) {
      story.title = contentLines[0]
      contentLines.shift() // Remove the first line since it's now the title
    }

    // Join the remaining lines as content
    story.content = contentLines.join("\n\n").trim()

    // If still no title, use a portion of content or default
    if (!story.title.trim()) {
      if (story.content.trim()) {
        story.title = story.content.split("\n")[0].substring(0, 50) + "..."
      } else {
        story.title = "Untitled Story"
      }
    }

    // Create excerpt
    story.excerpt = story.content.length > 200 ? story.content.substring(0, 200) + "..." : story.content

    console.log("Parsed story:", { title: story.title, category: story.category, contentLength: story.content.length })

    // Consider a story valid if it has either a title or content
    if (story.title.trim() || (story.content && story.content.trim())) {
      // If no title but has content, use first line of content as title
      if (!story.title.trim() && story.content) {
        const firstLine = story.content.split("\n")[0]
        story.title = firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine
        story.content = story.content.split("\n").slice(1).join("\n")
      }

      // Ensure story has an excerpt
      if (!story.excerpt || !story.excerpt.trim()) {
        story.excerpt = story.content.length > 200 ? story.content.substring(0, 200) + "..." : story.content
      }

      return story
    }

    return null
  }

  /**
   * Update statistics
   */
  updateStats() {
    const totalStoriesEl = document.getElementById("totalStories")
    const totalCategoriesEl = document.getElementById("totalCategories")
    const latestStoryEl = document.getElementById("latestStory")

    if (totalStoriesEl) totalStoriesEl.textContent = this.state.allStories.length
    if (totalCategoriesEl) totalCategoriesEl.textContent = this.state.categories.size

    if (latestStoryEl && this.state.allStories.length > 0) {
      latestStoryEl.textContent = this.state.allStories[0].date
    }
  }

  /**
   * Create category filter buttons
   */
  createCategoryFilters() {
    if (!this.elements.categoryFilters) return

    // Clear existing filters
    this.elements.categoryFilters.innerHTML = ""

    // Add "All" filter
    const allButton = this.createFilterButton("All Stories", null, !this.state.activeCategory)
    this.elements.categoryFilters.appendChild(allButton)

    // Add category filters
    Array.from(this.state.categories)
      .sort()
      .forEach((category) => {
        const button = this.createFilterButton(category, category, this.state.activeCategory === category)
        this.elements.categoryFilters.appendChild(button)
      })
  }

  /**
   * Create individual filter button
   */
  createFilterButton(text, category, isActive) {
    const button = document.createElement("button")
    button.className = `category-filter ${isActive ? "active" : ""}`
    button.textContent = text
    button.addEventListener("click", () => this.filterByCategory(category))
    return button
  }

  /**
   * Filter stories by category
   */
  filterByCategory(category) {
    this.state.activeCategory = category
    this.state.currentPage = 1
    this.createCategoryFilters()
    this.filterAndRenderStories()
  }

  /**
   * Filter and render stories based on current filters
   */
  filterAndRenderStories() {
    // Apply category filter
    let stories = this.state.activeCategory
      ? this.state.allStories.filter((story) => story.category === this.state.activeCategory)
      : this.state.allStories

    // Apply search filter
    if (this.state.searchTerm) {
      stories = stories.filter(
        (story) =>
          story.title.toLowerCase().includes(this.state.searchTerm) ||
          story.content.toLowerCase().includes(this.state.searchTerm) ||
          story.category.toLowerCase().includes(this.state.searchTerm),
      )
    }

    this.state.filteredStories = stories
    this.renderStories()
    this.updateLoadMoreButton()
  }

  /**
   * Render stories to the DOM
   */
  renderStories() {
    if (!this.elements.storiesContainer) return

    this.elements.storiesContainer.innerHTML = ""

    const endIndex = this.state.currentPage * this.postsPerPage
    this.state.displayedStories = this.state.filteredStories.slice(0, endIndex)

    if (this.state.displayedStories.length === 0) {
      this.renderEmptyState()
      return
    }

    this.state.displayedStories.forEach((story) => {
      const storyCard = this.createStoryCard(story)
      this.elements.storiesContainer.appendChild(storyCard)
    })
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    const emptyDiv = document.createElement("div")
    emptyDiv.className = "col-12"
    emptyDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-info-circle"></i>
        <span>${this.state.searchTerm ? "No stories found matching your search." : "No stories found in this category."}</span>
      </div>
    `
    this.elements.storiesContainer.appendChild(emptyDiv)
  }

  /**
   * Create story card element
   */
  createStoryCard(story) {
    const cardDiv = document.createElement("div")
    cardDiv.className = "col-lg-4 col-md-6"
    cardDiv.innerHTML = `
    <div class="story-card">
      <div class="story-content">
        <h3 class="story-title telugu-text">${this.escapeHtml(story.title)}</h3>
        <p class="story-excerpt telugu-text">${this.escapeHtml(story.excerpt)}</p>
        <div class="story-meta">
          <span><i class="far fa-calendar"></i> ${this.escapeHtml(story.date)}</span>
          <span><i class="fas fa-user"></i> ${this.escapeHtml(story.author)}</span>
          <span class="category-badge">${this.escapeHtml(story.category)}</span>
        </div>
        <button class="btn btn-primary read-more-btn" data-story-id="${story.id}">
          <i class="fas fa-arrow-right me-2"></i>
          <span>Read More</span>
        </button>
      </div>
    </div>
  `

    // Add event listener to the button
    const readMoreBtn = cardDiv.querySelector(".read-more-btn")
    readMoreBtn.addEventListener("click", (e) => {
      e.preventDefault()
      const storyId = e.target.closest(".read-more-btn").getAttribute("data-story-id")
      console.log("Read More clicked for story ID:", storyId)
      this.navigateToView("story", Number.parseInt(storyId))
    })

    return cardDiv
  }

  /**
   * Load more stories
   */
  loadMoreStories() {
    this.state.currentPage++
    this.renderStories()
    this.updateLoadMoreButton()
  }

  /**
   * Update load more button visibility
   */
  updateLoadMoreButton() {
    if (!this.elements.loadMoreBtn) return

    const totalDisplayed = this.state.displayedStories.length
    const hasMore = totalDisplayed < this.state.filteredStories.length

    this.elements.loadMoreBtn.style.display = hasMore ? "inline-flex" : "none"
  }

  /**
   * Navigate between views
   */
  navigateToView(view, storyId = null, pushState = true) {
    if (view === "home") {
      this.showHomePage(pushState)
    } else if (view === "story" && storyId) {
      this.showStoryPage(storyId, pushState)
    }
  }

  /**
   * Show home page
   */
  showHomePage(pushState = true) {
    this.elements.homePage.classList.add("active")
    this.elements.storyPage.classList.remove("active")
    this.state.currentView = "home"

    if (pushState) {
      const url = new URL(window.location.href)
      url.searchParams.delete("story")
      history.pushState({ view: "home" }, "Stories", url.toString())
    }

    window.scrollTo(0, 0)
  }

  /**
   * Show story page
   */
  showStoryPage(storyId, pushState = true) {
    console.log("Showing story page for ID:", storyId)

    this.elements.homePage.classList.remove("active")
    this.elements.storyPage.classList.add("active")
    this.state.currentView = "story"

    this.loadStory(storyId)

    if (pushState) {
      const url = new URL(window.location.href)
      url.searchParams.set("story", storyId)
      history.pushState({ view: "story", storyId: storyId }, "Story", url.toString())
    }

    window.scrollTo(0, 0)
  }

  /**
   * Show stories section
   */
  showStoriesSection() {
    this.showHomePage()
    setTimeout(() => {
      const storiesSection = document.getElementById("stories")
      if (storiesSection) {
        storiesSection.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 100)
  }

  /**
   * Go back to previous view
   */
  goBack() {
    if (this.state.currentView === "story") {
      this.showHomePage()
    }
  }

  /**
   * Load and display individual story
   */
  loadStory(storyId) {
    console.log("Loading story with ID:", storyId)
    console.log(
      "Available stories:",
      this.state.allStories.map((s) => ({ id: s.id, title: s.title })),
    )

    // If stories aren't loaded yet, wait and retry
    if (this.state.allStories.length === 0) {
      console.log("Stories not loaded yet, waiting...")
      setTimeout(() => {
        if (this.state.allStories.length > 0) {
          this.loadStory(storyId)
        } else {
          console.error("Stories still not available after waiting")
          this.renderStoryError()
          this.hideStoryLoading()
        }
      }, 1000)
      return
    }

    this.showStoryLoading()

    const story = this.state.allStories.find((s) => s.id == storyId)
    console.log("Found story:", story)

    if (story) {
      this.renderStory(story)
      this.hideStoryLoading()
    } else {
      console.error("Story not found for ID:", storyId)
      this.renderStoryError()
      this.hideStoryLoading()
    }
  }

  /**
   * Render individual story
   */
  renderStory(story) {
    if (!this.elements.storyContent) {
      console.error("Story content element not found")
      return
    }

    console.log("Rendering story:", story.title)
    document.title = `${story.title} - Story Collection`

    const formattedContent = story.content
      .split("\n\n")
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph) => `<p class="telugu-text">${this.escapeHtml(paragraph)}</p>`)
      .join("\n")

    this.elements.storyContent.innerHTML = `
    <article class="story-article">
      <h1 class="telugu-text">${this.escapeHtml(story.title)}</h1>
      <div class="story-meta">
        <span><i class="far fa-calendar"></i> ${this.escapeHtml(story.date)}</span>
        <span><i class="fas fa-user"></i> ${this.escapeHtml(story.author)}</span>
        <span class="category-badge">${this.escapeHtml(story.category)}</span>
      </div>
      <div class="story-body">
        ${formattedContent}
      </div>
      <div class="story-signature telugu-text">
        <p>మీ.. మహర్షి రమణ</p>
      </div>
    </article>
  `

    // Remove hidden class and add d-block to ensure visibility
    this.elements.storyContent.classList.remove("hidden", "d-none")
    this.elements.storyContent.classList.add("d-block")

    console.log("Story rendered successfully")
  }

  /**
   * Render story error
   */
  renderStoryError() {
    if (!this.elements.storyContent) return

    this.elements.storyContent.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Story not found.</span>
      </div>
    `
    this.elements.storyContent.classList.remove("hidden")
  }

  /**
   * Show document access error
   */
  showDocumentAccessError() {
    if (!this.elements.storiesContainer) return

    this.elements.storiesContainer.innerHTML = `
      <div class="error-message">
        <h3><i class="fas fa-exclamation-triangle"></i> Document Access Required</h3>
        <p><strong>Your Google Doc is not publicly accessible.</strong> Please follow these steps:</p>
        <ol>
          <li>Open your Google Doc: <a href="https://docs.google.com/document/d/${this.DOC_ID}/edit" target="_blank">Open Document</a></li>
          <li>Click the "Share" button (top right corner)</li>
          <li>Click "Change to anyone with the link"</li>
          <li>Set permission to "Viewer"</li>
          <li>Click "Done"</li>
          <li>Refresh this page</li>
        </ol>
        <button class="btn btn-primary" onclick="location.reload()">
          <i class="fas fa-sync-alt"></i>
          <span>Try Again</span>
        </button>
      </div>
    `
  }

  /**
   * Show loading state
   */
  showLoading() {
    if (this.elements.loadingSpinner) {
      this.elements.loadingSpinner.classList.remove("hidden")
    }
    if (this.elements.errorMessage) {
      this.elements.errorMessage.classList.add("hidden")
    }
    this.state.isLoading = true
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    if (this.elements.loadingSpinner) {
      this.elements.loadingSpinner.classList.add("hidden")
    }
    this.state.isLoading = false
  }

  /**
   * Show story loading state
   */
  showStoryLoading() {
    if (this.elements.storyLoadingSpinner) {
      this.elements.storyLoadingSpinner.classList.remove("hidden")
    }
    if (this.elements.storyContent) {
      this.elements.storyContent.classList.add("hidden")
    }
  }

  /**
   * Hide story loading state
   */
  hideStoryLoading() {
    if (this.elements.storyLoadingSpinner) {
      this.elements.storyLoadingSpinner.classList.add("hidden")
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    if (this.elements.errorMessage) {
      const span = this.elements.errorMessage.querySelector("span")
      if (span) span.textContent = message
      this.elements.errorMessage.classList.remove("hidden")
    }
    this.hideLoading()
  }

  /**
   * Utility: Debounce function
   */
  debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}

// Initialize the application
let storyManager

document.addEventListener("DOMContentLoaded", () => {
  storyManager = new StoryManager()
})

// Make storyManager globally available for onclick handlers
window.storyManager = storyManager
