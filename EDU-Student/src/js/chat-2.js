//////////////////////////////// V5 ///////////////////////////////
import { supaClient } from "./app.js";
import { getUserName } from "./app.js";
import { isInstitutionSchool } from "./app.js";
const studentId = sessionStorage.getItem("studentId");
const courseId = JSON.parse(sessionStorage.getItem("courseId"));
const chatName = document.querySelector(".chat__name");
const chats = document.querySelector(".chats");
const collapseButton = document.querySelector(".collapse__chat-btn");
const chatView = document.querySelector(".chat__view");
const chatListContainer = document.querySelector(".chats__list");
const chatImgEl = document.querySelector(".chat__img img");
let currentChatId = null;
let subscription = null;
// Track messages we've already seen to prevent duplicates
let processedMessageIds = new Set();
// Cache for user names to reduce API calls
const userNameCache = new Map();
// Images array
// Track all active chat IDs the user is part of
let userChats = [];
// Store subscriptions for all chats
const chatSubscriptions = {};

// Connection status tracking
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 3000;

// Prefetch the current user's name and cache it
if (studentId) {
  getUserName(studentId)
    .then((name) => {
      userNameCache.set(studentId, name);
    })
    .catch(() => {
      userNameCache.set(studentId, "Unknown User");
    });
}
async function OpenIfClickedFromCourse() {
  if (courseId && isUserComingFrom("courses.html")) {
    const chatName = await getCourseName();
    openChatByName(chatName);
    sessionStorage.setItem("courseId", null);
  }
}
OpenIfClickedFromCourse();
// Chat search functionality
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.querySelector(".chats__search");
  const chatsList = document.querySelector(".chats__list");

  // Function to handle search
  function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const chatItems = document.querySelectorAll(".chat__item");
    // console.log(searchTerm);
    // console.log(chatItems);
    if (chatItems.length === 0) {
      // No chat items loaded yet
      return;
    }

    // Show all chats if search term is empty
    if (searchTerm === "") {
      chatItems.forEach((item) => {
        item.style.display = "flex";
      });
      return;
    }

    // Filter chats based on search term
    chatItems.forEach((item) => {
      const chatName = item
        .querySelector(".chat__name")
        .textContent.toLowerCase();

      // If you have chat preview text, you can include it in the search as well
      const chatPreview = item.querySelector(".chat__preview")
        ? item.querySelector(".chat__preview").textContent.toLowerCase()
        : "";

      if (chatName.includes(searchTerm) || chatPreview.includes(searchTerm)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  }

  // Add event listener for search input
  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
    // Add clear search functionality when clicking the X (if supported by browser)
    searchInput.addEventListener("search", function () {
      handleSearch({ target: searchInput });
    });
  }

  // Optionally, highlight the search term in results
  function highlightSearchTerm(element, searchTerm) {
    if (!searchTerm) return;

    const innerHTML = element.innerHTML;
    const index = innerHTML.toLowerCase().indexOf(searchTerm);

    if (index >= 0) {
      const highlighted =
        innerHTML.substring(0, index) +
        '<span class="highlight">' +
        innerHTML.substring(index, index + searchTerm.length) +
        "</span>" +
        innerHTML.substring(index + searchTerm.length);
      element.innerHTML = highlighted;
    }
  }

  // Add highlight style to your CSS
  const style = document.createElement("style");
  style.textContent = `
    .highlight {
      background-color: rgba(89, 85, 179, 0.2);
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
});
// Add a custom clear button
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.querySelector(".chats__search");
  const inputGroup = searchInput.closest(".input__group");

  // Create custom clear button
  const clearButton = document.createElement("button");
  clearButton.className = "search__clear-btn";
  clearButton.innerHTML = "×"; // Use × character or an SVG icon
  clearButton.style.display = "none"; // Hide initially

  // Insert the button into the DOM
  inputGroup.appendChild(clearButton);

  // Style the button with inline styles (or add to your CSS)
  Object.assign(clearButton.style, {
    position: "absolute",
    right: "6rem",
    background: "none",
    border: "none",
    fontSize: "2.8rem",
    cursor: "pointer",
    color: "#999aaa",
  });

  // Show/hide the clear button based on input content
  searchInput.addEventListener("input", function () {
    clearButton.style.display = this.value ? "block" : "none";
  });

  // Clear the input when button is clicked
  clearButton.addEventListener("click", function () {
    searchInput.value = "";
    clearButton.style.display = "none";
    searchInput.focus();

    // Trigger the search event to update results
    const event = new Event("input");
    searchInput.dispatchEvent(event);
  });
});

async function loadUserNames(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(
    (id) => id && !userNameCache.has(id)
  );

  if (uniqueIds.length === 0) return;

  // Load user names in parallel - check both students and instructors
  const promises = uniqueIds.map(async (userId) => {
    try {
      // First check if it's an instructor
      const instructorName = await getInstructorName(userId);
      if (instructorName) {
        userNameCache.set(userId, instructorName);
        return;
      }

      // If not an instructor, try as a student
      const name = await getUserName(userId);
      userNameCache.set(userId, name);
    } catch (error) {
      userNameCache.set(userId, "Unknown User");
    }
  });

  await Promise.all(promises);
}
function openChat() {
  chats.classList.add("open");
  chatView.classList.add("active");
}

function closeChat() {
  chats.classList.remove("open");
  chatView.classList.remove("active");
  document.querySelectorAll(".chat__item").forEach((chat) => {
    chat.classList.remove("active");
  });
}

function attachChatClickListeners() {
  document.querySelectorAll(".chat__item").forEach((chatItem) => {
    const img = chatItem.querySelector("img");
    chatItem.addEventListener("click", async (e) => {
      // Close chat list and open chat view
      chatImgEl.src = img.src;
      if (
        e.target.closest(".chat__item") &&
        !e.target.closest(".chat__item").classList.contains("active")
      ) {
        document.querySelectorAll(".chat__item").forEach((item) => {
          item.classList.remove("active");
        });
        e.target.closest(".chat__item").classList.add("active");
        openChat();
      }

      const chatId = chatItem.getAttribute("data-chat-id");

      // Don't reload if we're already on this chat
      if (currentChatId === chatId) {
        return;
      }

      // Unsubscribe from previous chat subscription if exists
      if (subscription) {
        subscription.unsubscribe();
      }

      currentChatId = chatId;
      const chatNameText = chatItem.getAttribute("data-chat-name");

      // Reset processed message IDs when changing chats
      processedMessageIds = new Set();

      // Show loading indicator
      const messagesContainer = document.querySelector(
        ".chat__messages-container"
      );
      messagesContainer.innerHTML =
        '<div class="loading-messages loader"></div>';

      // Load chat details
      const chatDetailsPromise = getChatDetails(chatId);
      const messagesPromise = retrieveChatMessages(chatId);

      // Load chat details and messages in parallel
      try {
        const [chatDetails, chatMessages] = await Promise.all([
          chatDetailsPromise,
          messagesPromise,
        ]);

        // Render chat details
        renderChatDetails(chatDetails);

        // Extract all user IDs for parallel name loading
        const userIds = chatMessages.map(
          (msg) => +msg.sender_data.slice(0, 14)
        );
        // console.log(userIds);
        userIds.push(studentId); // Include current user

        // Prefetch all user names in parallel before rendering messages
        await loadUserNames(userIds);

        // Only render if this is still the current chat
        if (currentChatId === chatId) {
          // Render chat messages
          renderChatMessages(chatMessages, false); // false = no animation on initial load
        }
      } catch (error) {
        console.error("Error loading messages:", error);
        messagesContainer.innerHTML =
          '<div class="error-messages">Error loading messages. Please try again.</div>';
      }

      // Set up event listener for send button
      setupSendMessageHandler(chatId);

      // Make sure subscription is active for this chat
      setupChatSubscription(chatId);
    });
  });

  collapseButton.addEventListener("click", closeChat);
}

function setupSendMessageHandler(chatId) {
  const sendButton = document.querySelector(".send__message-btn");
  const messageInput = document.querySelector(".message__input");

  // First, remove any existing event listeners by cloning the elements
  const newSendButton = sendButton.cloneNode(true);
  sendButton.parentNode.replaceChild(newSendButton, sendButton);

  const newMessageInput = messageInput.cloneNode(true);
  messageInput.parentNode.replaceChild(newMessageInput, messageInput);

  // Add event listener to the send button
  newSendButton.addEventListener("click", async () => {
    const messageContent = newMessageInput.value.trim();
    if (messageContent) {
      await sendMessage(chatId, messageContent);
      newMessageInput.value = ""; // Clear input after sending
      newMessageInput.focus(); // Keep focus on input for better UX
    }
  });

  // Add event listener for Enter key
  newMessageInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent default to avoid form submission
      const messageContent = newMessageInput.value.trim();
      if (messageContent) {
        await sendMessage(chatId, messageContent);
        newMessageInput.value = ""; // Clear input after sending
      }
    }
  });

  // Focus the input field for immediate typing
  newMessageInput.focus();
}

// Set up subscriptions for all user chats
function setupAllChatSubscriptions() {
  // Clean up existing subscriptions
  Object.values(chatSubscriptions).forEach((sub) => {
    if (sub) sub.unsubscribe();
  });

  // Reset subscription objects
  Object.keys(chatSubscriptions).forEach((key) => {
    delete chatSubscriptions[key];
  });

  // Set up a subscription for each chat
  userChats.forEach((chatId) => {
    setupChatSubscription(chatId);
  });

  // Reset reconnection attempts on successful setup
  reconnectAttempts = 0;
}

function setupChatSubscription(chatId) {
  // Unsubscribe from any existing subscription for this chat
  if (chatSubscriptions[chatId]) {
    chatSubscriptions[chatId].unsubscribe();
    delete chatSubscriptions[chatId];
  }

  // Create a more robust subscription with better error handling
  try {
    // Create a new channel for this chat
    const channel = supaClient.channel(`chat:${chatId}`);

    // Subscribe to changes
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          filter: `chat_id=eq.${chatId}`,
        },
        handleNewMessage
      )
      .subscribe((status) => {
        console.log(`Subscription status for chat ${chatId}:`, status);

        if (status === "SUBSCRIBED") {
          console.log(`Successfully subscribed to chat ${chatId}`);
          isConnected = true;
          reconnectAttempts = 0;
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "CLOSED" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            `Error with subscription for chat ${chatId}: ${status}`
          );
          isConnected = false;

          // Try to resubscribe after a delay if there was an error
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(
              `Attempt ${reconnectAttempts} to reconnect chat ${chatId} in ${RECONNECT_INTERVAL}ms`
            );

            setTimeout(() => {
              if (!isConnected) {
                setupChatSubscription(chatId);
              }
            }, RECONNECT_INTERVAL);
          } else {
            console.error(
              `Maximum reconnection attempts reached for chat ${chatId}`
            );
          }
        }
      });

    // Store the subscription reference
    chatSubscriptions[chatId] = channel;

    // Update the current chat subscription reference
    if (chatId === currentChatId) {
      subscription = channel;
    }
  } catch (error) {
    console.error(`Error setting up subscription for chat ${chatId}:`, error);

    // Try to resubscribe after a delay
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(() => {
        if (!isConnected) {
          setupChatSubscription(chatId);
        }
      }, RECONNECT_INTERVAL);
    }
  }
}

function handleNewMessage(payload) {
  if (!payload || !payload.new || !payload.new.msg_id) {
    console.error("Invalid message payload received:", payload);
    return;
  }

  const message = payload.new;

  // Skip if we've already processed this message
  if (processedMessageIds.has(message.msg_id)) {
    console.log(`Skipping duplicate message ${message.msg_id}`);
    return;
  }

  // Mark as processed to prevent duplicates
  processedMessageIds.add(message.msg_id);

  console.log(`New message received in chat ${message.chat_id}:`, message);
  const senderId = +message.sender_data.slice(0, 14);
  
  // Check if this is a message from the current user
  const isCurrentUserMessage = senderId === +studentId;
  
  // Check if we already have this message locally rendered (for the current user's messages)
  if (isCurrentUserMessage && currentChatId === message.chat_id) {
    // Look for a locally added message with the same content
    const localMessages = document.querySelectorAll('[data-local-message="true"]');
    for (const localMsg of localMessages) {
      // If we find a matching local message with the same content, just update its ID and skip adding a new one
      const contentEl = localMsg.querySelector('.message__content');
      if (contentEl && contentEl.textContent === message.msg_content) {
        localMsg.setAttribute('data-message-id', message.msg_id);
        localMsg.removeAttribute('data-local-message');
        return; // Skip further processing
      }
    }
  }
  
  const senderName = message.sender_data.slice(15);
  
  // Pre-load sender name if needed before processing the message
  if (senderId && !userNameCache.has(senderId)) {
    userNameCache.set(senderId, senderName);
    processMessageUpdate(message);
  } else {
    // Process immediately if sender info is available
    processMessageUpdate(message);
  }
}

function processMessageUpdate(message) {
  try {
    console.log(
      `Processing message update for chat ${message.chat_id}, current chat: ${currentChatId}`
    );
    const senderId = +message.sender_data.slice(0, 14);
    const senderName = message.sender_data.slice(15);
    // If this is the current open chat, add message to chat view
    if (Number(currentChatId) === Number(message.chat_id)) {
      console.log("This is the active chat, adding message to view");
      addMessageToChat(message);
    } else {
      console.log("Message is for a different chat than the current one");
    }

    // Update the chat list item with this message regardless
    updateLastMessageInChatList(message.chat_id, message.msg_content, senderId, senderName);
  } catch (error) {
    console.error("Error processing message update:", error);
  }
}
// Create a single message element for faster DOM operations
// function createMessageElement(message, animate = true) {
//   // Create the new message element
//   const messageEl = document.createElement("div");
//   messageEl.setAttribute("data-message-id", message.msg_id);
//   messageEl.setAttribute(
//     "data-timestamp",
//     new Date(message.msg_date_time).getTime()
//   );

//   const messageSenderName = document.createElement("p");
//   const messageContent = document.createElement("p");
//   const messageTime = document.createElement("p");

//   messageSenderName.classList.add("message__sender-name");
//   messageContent.classList.add("message__content");
//   messageTime.classList.add("message__time");

//   messageContent.textContent = message.msg_content || "";
//   messageTime.textContent = formatDateTime(new Date(message.msg_date_time));
//   const senderId = +message.sender_data.slice(0, 14);
//   const senderName = message.sender_data.slice(15);
//   // Check if the message is from the current user
//   const isSentByCurrentUser = senderId === +studentId;
//   // Add message classes based on sender
//   if (isSentByCurrentUser) {
//     messageEl.classList.add("sent");
//     messageSenderName.textContent = "You";
//   } else {
//     messageEl.classList.add("received");
//     messageSenderName.textContent = senderName || "User";
//     if (String(senderId).startsWith("2")) {
//       messageEl.classList.add("instrctor-message");
//     }
//   }

//   messageEl.classList.add("message");

//   messageEl.appendChild(messageSenderName);
//   messageEl.appendChild(messageContent);
//   messageEl.appendChild(messageTime);

//   // Add animation if needed
//   if (animate) {
//     messageEl.style.opacity = "0";
//     messageEl.style.transform = "translateY(10px)";

//     // Use requestAnimationFrame for smoother animations
//     requestAnimationFrame(() => {
//       messageEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
//       messageEl.style.opacity = "1";
//       messageEl.style.transform = "translateY(0)";
//     });
//   }

//   return messageEl;
// }
// function createMessageElement(message, animate = true) {
//   // Create the new message element
//   const messageEl = document.createElement("div");
//   messageEl.setAttribute("data-message-id", message.msg_id);
//   messageEl.setAttribute(
//     "data-timestamp",
//     new Date(message.msg_date_time).getTime()
//   );

//   const messageSenderName = document.createElement("p");
//   const messageContent = document.createElement("p");
//   const messageTime = document.createElement("p");

//   messageSenderName.classList.add("message__sender-name");
//   messageContent.classList.add("message__content");
//   messageTime.classList.add("message__time");

//   messageTime.textContent = formatDateTime(new Date(message.msg_date_time));
//   const senderId = +message.sender_data.slice(0, 14);
//   const senderName = message.sender_data.slice(15);
  
//   // Check if the message is from the current user
//   const isSentByCurrentUser = senderId === +studentId;
  
//   // Add message classes based on sender
//   if (isSentByCurrentUser) {
//     messageEl.classList.add("sent");
//     messageSenderName.textContent = "You";
//   } else {
//     messageEl.classList.add("received");
//     messageSenderName.textContent = senderName || "User";
//     if (String(senderId).startsWith("2")) {
//       messageEl.classList.add("instrctor-message");
//     }
//   }

//   messageEl.classList.add("message");
  
//   // Check if this is a file or image message
//   if (message.msg_content.includes('|IMAGE|')) {
//     // This is an image message
//     const parts = message.msg_content.split('|IMAGE|');
//     const caption = parts[0];
//     const imageUrl = parts[1];
    
//     // Create an image element
//     const imgElement = document.createElement('img');
//     imgElement.className = 'message-image';
//     imgElement.src = imageUrl;
//     imgElement.alt = caption;
//     imgElement.loading = 'lazy';
    
//     // Add click to view full size
//     imgElement.addEventListener('click', () => {
//       openImageViewer(imageUrl, caption);
//     });
    
//     // Add caption if not just the default [Image: filename]
//     if (caption && !caption.startsWith('[Image:')) {
//       messageContent.textContent = caption;
//     }
    
//     // Append image after text content
//     messageEl.appendChild(messageSenderName);
//     messageEl.appendChild(messageContent);
//     messageEl.appendChild(imgElement);
//     messageEl.appendChild(messageTime);
//   } 
//   else if (message.msg_content.includes('|FILE|')) {
//     // This is a file message
//     const parts = message.msg_content.split('|FILE|');
//     const fileName = parts[0].replace('[File: ', '').replace(']', '');
//     const fileUrl = parts[1];
//     const fileType = parts[2] || 'application/octet-stream';
//     const fileSize = parts[3] ? formatFileSize(parseInt(parts[3])) : 'Unknown size';
    
//     // Create a file attachment element
//     const fileElement = document.createElement('div');
//     fileElement.className = 'file-attachment';
    
//     // Set icon based on file type
//     let fileIcon = 'document';
//     if (fileType.includes('pdf')) fileIcon = 'pdf';
//     else if (fileType.includes('word') || fileType.includes('doc')) fileIcon = 'doc';
//     else if (fileType.includes('spreadsheet') || fileType.includes('excel')) fileIcon = 'xls';
    
//     fileElement.innerHTML = `
//       <div class="file-icon ${fileIcon}-icon"></div>
//       <div class="file-info">
//         <div class="file-name">${fileName}</div>
//         <div class="file-meta">${fileSize}</div>
//       </div>
//     `;
    
//     // Add click to download
//     fileElement.addEventListener('click', () => {
//       window.open(fileUrl, '_blank');
//     });
    
//     messageEl.appendChild(messageSenderName);
//     messageEl.appendChild(fileElement);
//     messageEl.appendChild(messageTime);
//   }
//   else {
//     // Regular text message
//     messageContent.textContent = message.msg_content || "";
    
//     messageEl.appendChild(messageSenderName);
//     messageEl.appendChild(messageContent);
//     messageEl.appendChild(messageTime);
//   }

//   // Add animation if needed
//   if (animate) {
//     messageEl.style.opacity = "0";
//     messageEl.style.transform = "translateY(10px)";

//     // Use requestAnimationFrame for smoother animations
//     requestAnimationFrame(() => {
//       messageEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
//       messageEl.style.opacity = "1";
//       messageEl.style.transform = "translateY(0)";
//     });
//   }

//   return messageEl;
// }
function createMessageElement(message, animate = true) {
  // Create the new message element
  const messageEl = document.createElement("div");
  messageEl.setAttribute("data-message-id", message.msg_id);
  messageEl.setAttribute(
    "data-timestamp",
    new Date(message.msg_date_time).getTime()
  );

  const messageSenderName = document.createElement("p");
  const messageContent = document.createElement("p");
  const messageTime = document.createElement("p");

  messageSenderName.classList.add("message__sender-name");
  messageContent.classList.add("message__content");
  messageTime.classList.add("message__time");

  messageTime.textContent = formatDateTime(new Date(message.msg_date_time));
  const senderId = +message.sender_data.slice(0, 14);
  const senderName = message.sender_data.slice(15);
  
  // Check if the message is from the current user
  const isSentByCurrentUser = senderId === +studentId;
  
  // Add message classes based on sender
  if (isSentByCurrentUser) {
    messageEl.classList.add("sent");
    messageSenderName.textContent = "You";
  } else {
    messageEl.classList.add("received");
    messageSenderName.textContent = senderName || "User";
    if (String(senderId).startsWith("2")) {
      messageEl.classList.add("instrctor-message");
    }
  }

  messageEl.classList.add("message");
  
  // Fix: Parse message content correctly - check if it contains the markers
  // Debug: Add logging to see the message content
  console.log("Message content:", message.msg_content);
  
  // Check if this is a file or image message - make the check more robust
  if (message.msg_content && message.msg_content.includes('|IMAGE|')) {
    // This is an image message
    const parts = message.msg_content.split('|IMAGE|');
    const caption = parts[0];
    const imageUrl = parts[1];
    
    console.log("Image detected:", { caption, imageUrl });
    
    // Create an image element
    const imgElement = document.createElement('img');
    imgElement.className = 'message-image';
    imgElement.src = imageUrl;
    imgElement.alt = caption;
    imgElement.loading = 'lazy';
    
    // Add click to view full size
    imgElement.addEventListener('click', () => {
      openImageViewer(imageUrl, caption);
    });
    
    // Add caption if not just the default [Image: filename]
    if (caption && !caption.startsWith('[Image:')) {
      messageContent.textContent = caption;
    }
    
    // Append image after text content
    messageEl.appendChild(messageSenderName);
    messageEl.appendChild(messageContent);
    messageEl.appendChild(imgElement);
    messageEl.appendChild(messageTime);
  } 
  else if (message.msg_content && message.msg_content.includes('|FILE|')) {
    // This is a file message
    const parts = message.msg_content.split('|FILE|');
    const fileCaption = parts[0];
    const fileUrl = parts[1];
    const fileType = parts[2] || 'application/octet-stream';
    const fileSize = parts[3] ? formatFileSize(parseInt(parts[3])) : 'Unknown size';
    
    console.log("File detected:", { fileCaption, fileUrl, fileType, fileSize });
    
    // Extract filename from caption
    let fileName = fileCaption;
    if (fileCaption.startsWith('[File: ') && fileCaption.includes(']')) {
      fileName = fileCaption.replace('[File: ', '').replace(']', '');
    }
    
    // Create a file attachment element
    const fileElement = document.createElement('div');
    fileElement.className = 'file-attachment';
    
    // Set icon based on file type
    let fileIcon = 'document';
    if (fileType.includes('pdf')) fileIcon = 'pdf';
    else if (fileType.includes('word') || fileType.includes('doc')) fileIcon = 'doc';
    else if (fileType.includes('spreadsheet') || fileType.includes('excel')) fileIcon = 'xls';
    
    fileElement.innerHTML = `
      <div class="file-icon ${fileIcon}-icon"></div>
      <div class="file-info">
        <div class="file-name">${fileName}</div>
        <div class="file-meta">${fileSize}</div>
      </div>
    `;
    
    // Add click to download
    fileElement.addEventListener('click', () => {
      window.open(fileUrl, '_blank');
    });
    
    messageEl.appendChild(messageSenderName);
    messageEl.appendChild(fileElement);
    messageEl.appendChild(messageTime);
  }
  else {
    // Regular text message
    messageContent.textContent = message.msg_content || "";
    
    messageEl.appendChild(messageSenderName);
    messageEl.appendChild(messageContent);
    messageEl.appendChild(messageTime);
  }

  // Add animation if needed
  if (animate) {
    messageEl.style.opacity = "0";
    messageEl.style.transform = "translateY(10px)";

    // Use requestAnimationFrame for smoother animations
    requestAnimationFrame(() => {
      messageEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      messageEl.style.opacity = "1";
      messageEl.style.transform = "translateY(0)";
    });
  }

  return messageEl;
}
// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  else return (bytes / 1073741824).toFixed(1) + ' GB';
}

async function addMessageToChat(message) {
  // First check if we already have this message in the DOM by msg_id
  const existingMessage = document.querySelector(
    `[data-message-id="${message.msg_id}"]`
  );
  
  if (existingMessage) {
    return; // Skip if already exists by ID
  }
  
  // Check if the message is from current user and matches a local message
  const senderId = +message.sender_data.slice(0, 14);
  if (senderId === +studentId) {
    // Look for a locally added message with the same content
    const localMessages = document.querySelectorAll('[data-local-message="true"]');
    for (const localMsg of localMessages) {
      const contentEl = localMsg.querySelector('.message__content');
      if (contentEl && contentEl.textContent === message.msg_content) {
        // Update the local message instead of creating a new one
        localMsg.setAttribute('data-message-id', message.msg_id);
        localMsg.removeAttribute('data-local-message');
        return; // Skip creating a new message
      }
    }
  }

  // Create the message element
  const messagesContainer = document.querySelector(".chat__messages-container");

  // Check if we have a container
  if (!messagesContainer) {
    console.error("Messages container not found");
    return;
  }

  const messageEl = createMessageElement(message, true);

  // Always append the message at the end (chronological order)
  messagesContainer.appendChild(messageEl);

  // Scroll to the bottom to show the new message
  scrollToBottom();
}
// Use a more efficient scrolling method with requestAnimationFrame
function scrollToBottom() {
  requestAnimationFrame(() => {
    const messagesContainer = document.querySelector(
      ".chat__messages-container"
    );
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });
}
function formatDateTime(date) {
  const now = new Date();

  // Strip time parts for accurate day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const timeString = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today - messageDate) / oneDay);

  if (diffDays === 0) {
    return timeString; // Today
  } else if (diffDays === 1) {
    return `Yesterday ${timeString}`;
  } else {
    const dateString = date.toLocaleDateString("en-CA"); // yyyy-mm-dd format
    return `${dateString} ${timeString}`;
  }
}
async function renderChatList() {
  try {
    chatListContainer.innerHTML = '<div class="loader loading-chats"></div>';
    const chats = await getChatList();

    // Store the chat IDs for subscription
    userChats = chats.map((chat) => chat.chat_id);

    if (chats.length === 0) {
      // Display a message when no chats are available
      chatListContainer.innerHTML = `
        <li class="no-chats">
          <p>No chats available</p>
        </li>
      `;
      return;
    }

    // Create a document fragment for batch DOM updates
    const fragment = document.createDocumentFragment();
    const pendingChats = [];

    // First render the basic chat list structure
    for (const chat of chats) {
      const chatItem = document.createElement("li");
      chatItem.className = "chat__item";
      chatItem.setAttribute("data-chat-id", chat.chat_id);
      chatItem.setAttribute("data-chat-name", chat.chat_name);
      chatItem.innerHTML = `
        <div class="chat__img">
        <img src="src/images/Courses/${chat.chat_name.toUpperCase()}.png" alt="${
        chat.chat_name
      }" onerror="this.onerror=null; this.src='src/images/Courses/ai.png';">
        </div>
        <div class="chat__details">
          <div class="chat__name">${chat.chat_name}</div>
          <div class="chat__last-message">Loading...</div>
        </div>
      `;

      fragment.appendChild(chatItem);
      pendingChats.push(chat.chat_id);
    }

    // Update the DOM once with all chat items
    chatListContainer.innerHTML = "";
    chatListContainer.appendChild(fragment);

    // Attach click listeners immediately
    attachChatClickListeners();

    // Set up subscriptions for all chats
    setupAllChatSubscriptions();

    // Then load last messages for each chat in parallel
    const lastMessagePromises = pendingChats.map(async (chatId) => {
      const lastMessage = await getLastMessage(chatId);
      if (lastMessage) {
        const senderId = +lastMessage.sender_data.slice(0, 14);
        const senderName = lastMessage.sender_data.slice(15);
        // Ensure we have the sender name
        if (senderId && !userNameCache.has(senderId)) {
          userNameCache.set(senderId, senderName);
        }
        return { chatId, lastMessage };
      }
      return { chatId, lastMessage: null };
    });

    // Update last messages as they come in
    const results = await Promise.all(lastMessagePromises);

    // Update the UI with last message data
    for (const { chatId, lastMessage } of results) {
      const chatItem = document.querySelector(
        `.chat__item[data-chat-id="${chatId}"]`
      );
      if (!chatItem) continue;

      const lastMessageEl = chatItem.querySelector(".chat__last-message");
      if (!lastMessageEl) continue;

      updateChatLastMessageDisplay(lastMessageEl, lastMessage);
    }
  } catch (error) {
    console.error("Error rendering chat list:", error);
    chatListContainer.innerHTML = `
      <li class="error-message">
        <p>Error loading chats. Please try again.</p>
      </li>
    `;
  }
}

// Helper function to update last message display
function updateChatLastMessageDisplay(lastMessageEl, lastMessage) {
  let messageText = "No messages yet...";
  let senderPrefix = "";

  if (lastMessage) {
    messageText = truncateText(lastMessage.msg_content, 30);
    const senderId = +lastMessage.sender_data.slice(0, 14);
    const senderName = lastMessage.sender_data.slice(15);
    // Properly determine the sender prefix
    if (+studentId === senderId) {
      senderPrefix = "You: ";
    } else if (senderId && userNameCache.has(senderId)) {
      senderPrefix = `${senderName}: `;
    }
  }  
  lastMessageEl.textContent = senderPrefix + messageText;
}
  
function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

async function getLastMessage(chatId) {
  const { data, error } = await supaClient
    .from("message")
    .select("*")
    .eq("chat_id", chatId)
    .order("msg_date_time", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }
  return data[0];
}

async function getChatList() {
  const { data, error } = await supaClient
    .from("student_chat")
    .select("*")
    .eq("student_id", studentId);

  if (error) {
    console.error("Error fetching chat list:", error);
    return [];
  }

  if (data && data.length > 0) {
    const { data: chats, error } = await supaClient
      .from("chat")
      .select("*")
      .in(
        "chat_id",
        data.map((chat) => chat.chat_id)
      );

    if (error) {
      console.error("Error fetching chat details:", error);
      return [];
    } else {
      return chats;
    }
  }
  return [];
}

async function getChatDetails(chatId) {
  const { data, error } = await supaClient
    .from("chat")
    .select("*")
    .eq("chat_id", chatId)
    .single();

  if (error) {
    console.error("Error fetching chat details:", error);
    return null;
  } else {
    return data;
  }
}

function renderChatDetails(chat) {
  if (chat) {
    chatName.textContent = chat.chat_name;
  }
}

async function retrieveChatMessages(chatId) {
  const { data, error } = await supaClient
    .from("message")
    .select("*")
    .eq("chat_id", chatId)
    .order("msg_date_time", { ascending: true }) // Primary sort by timestamp
    .order("msg_id", { ascending: true }); // Secondary sort by message_id for consistency

  if (error) {
    console.error("Error fetching chat messages:", error);
    return [];
  } else {
    // Build our processed message IDs set
    data.forEach((msg) => {
      if (msg.msg_id) {
        processedMessageIds.add(msg.msg_id);
      }
    });

    return data;
  }
}
// function renderChatMessages(messages, animate = true) {
//   // Get the messages container
//   const messagesContainer = document.querySelector(".chat__messages-container");

//   // Clear existing messages
//   messagesContainer.innerHTML = "";

//   if (!messages || messages.length === 0) {
//     // Show a message when there are no messages
//     const emptyMessage = document.createElement("div");
//     emptyMessage.classList.add("empty-messages");
//     emptyMessage.textContent = "No messages yet. Start the conversation!";
//     messagesContainer.appendChild(emptyMessage);
//     return;
//   }

//   // Add scroll to load more UI element if we have more than 50 messages
//   if (messages.length > 50) {
//     const loadMoreDiv = document.createElement("div");
//     loadMoreDiv.classList.add("load-more-messages");
//     loadMoreDiv.textContent = "Scroll to load older messages";
//     loadMoreDiv.setAttribute("data-total-messages", messages.length);
//     messagesContainer.appendChild(loadMoreDiv);
//   }

//   // Modified: Only render the last 50 messages initially
//   const messagesToRender = messages.slice(-50);

//   // Performance optimization: Create a document fragment for batch render
//   const fragment = document.createDocumentFragment();
//   // Render messages in fragment
//   messagesToRender.forEach(message => {
//     const messageEl = createMessageElement(message, true);
//     fragment.appendChild(messageEl);
//   });

//   // Append all messages at once
//   messagesContainer.appendChild(fragment);

//   // Store all messages in a data attribute for later lazy loading
//   messagesContainer.setAttribute("data-all-messages", JSON.stringify(messages));
//   messagesContainer.setAttribute("data-displayed-count", messagesToRender.length);

//   // Scroll to bottom when all messages are rendered
//   scrollToBottom();
  
//   // Set up scroll event listener for lazy loading older messages
//   setupScrollListener();
// }
function renderChatMessages(messages, animate = true) {
  // Get the messages container
  const messagesContainer = document.querySelector(".chat__messages-container");
  
  // Clear existing messages
  messagesContainer.innerHTML = "";
  
  if (!messages || messages.length === 0) {
    // Show a message when there are no messages
    const emptyMessage = document.createElement("div");
    emptyMessage.classList.add("empty-messages");
    emptyMessage.textContent = "No messages yet. Start the conversation!";
    messagesContainer.appendChild(emptyMessage);
    return;
  }
  
  // Add scroll to load more UI element if we have more than 50 messages
  if (messages.length > 50) {
    const loadMoreDiv = document.createElement("div");
    loadMoreDiv.classList.add("load-more-messages");
    loadMoreDiv.textContent = "Scroll to load older messages";
    loadMoreDiv.setAttribute("data-total-messages", messages.length);
    messagesContainer.appendChild(loadMoreDiv);
  }
  
  // Modified: Only render the last 50 messages initially
  const messagesToRender = messages.slice(-50);
  
  // Performance optimization: Create a document fragment for batch render
  const fragment = document.createDocumentFragment();
  
  // Render messages in fragment
  messagesToRender.forEach(message => {
    const messageEl = createMessageElement(message, animate);
    fragment.appendChild(messageEl);
  });
  
  // Append all messages at once
  messagesContainer.appendChild(fragment);
  
  // Store all messages in a data attribute for later lazy loading
  messagesContainer.setAttribute("data-all-messages", JSON.stringify(messages));
  messagesContainer.setAttribute("data-displayed-count", messagesToRender.length);
  
  // Scroll to bottom when all messages are rendered
  scrollToBottom();
  
  // Set up scroll event listener for lazy loading older messages
  setupScrollListener();
}
function setupScrollListener() {
  const messagesContainer = document.querySelector(".chat__messages-container");
  
  // Remove any existing scroll listeners first
  messagesContainer.removeEventListener("scroll", handleScroll);
  
  // Add the scroll event listener
  messagesContainer.addEventListener("scroll", handleScroll);
}
function handleScroll(event) {
  const container = event.target;
  
  // If we're near the top (within 100px) and not currently loading
  if (container.scrollTop < 100 && !container.classList.contains("loading-older")) {
    loadOlderMessages();
  }
}
// Add this function to load older messages
function loadOlderMessages() {
  const messagesContainer = document.querySelector(".chat__messages-container");
  
  // Get data about messages
  const allMessagesJson = messagesContainer.getAttribute("data-all-messages");
  const displayedCount = parseInt(messagesContainer.getAttribute("data-displayed-count"), 10);
  
  if (!allMessagesJson) return;
  
  const allMessages = JSON.parse(allMessagesJson);
  
  // If we've shown all messages, do nothing
  if (displayedCount >= allMessages.length) {
    return;
  }
  
  // Remember scroll height for scroll position restoration
  const scrollHeight = messagesContainer.scrollHeight;
  
  // Add loading indicator
  messagesContainer.classList.add("loading-older");
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "loading-indicator";
  loadingIndicator.textContent = "Loading older messages...";
  messagesContainer.insertBefore(loadingIndicator, messagesContainer.firstChild);
  
  // Use setTimeout to give UI time to update
  setTimeout(() => {
    // Determine how many more messages to load (batch of 20)
    const batchSize = 20;
    const newDisplayedCount = Math.min(displayedCount + batchSize, allMessages.length);
    const newMessages = allMessages.slice(allMessages.length - newDisplayedCount, allMessages.length - displayedCount);
    
    // Create fragment for new messages
    const fragment = document.createDocumentFragment();
    
    // Add new messages to top
    newMessages.forEach(message => {
      const messageEl = createMessageElement(message, false);
      fragment.appendChild(messageEl);
    });
    
    // Remove loading indicator
    loadingIndicator.remove();
    
    // Add new messages to the top
    if (messagesContainer.firstChild) {
      messagesContainer.insertBefore(fragment, messagesContainer.firstChild);
    } else {
      messagesContainer.appendChild(fragment);
    }
    
    // Update the displayed count
    messagesContainer.setAttribute("data-displayed-count", newDisplayedCount);
    
    // Remove loading class
    messagesContainer.classList.remove("loading-older");
    
    // Maintain scroll position
    messagesContainer.scrollTop = messagesContainer.scrollHeight - scrollHeight;
    
    // If we've loaded all messages, remove the "Scroll to load" message
    if (newDisplayedCount >= allMessages.length) {
      const loadMoreDiv = messagesContainer.querySelector(".load-more-messages");
      if (loadMoreDiv) {
        loadMoreDiv.remove();
      }
    }
  }, 500); // Short delay for better UX
}
// Helper function to update last message in chat list
async function updateLastMessageInChatList(chatId, messageContent, senderId) {
  const chatItem = document.querySelector(
    `.chat__item[data-chat-id="${chatId}"]`
  );

  if (chatItem) {
    const lastMessageEl = chatItem.querySelector(".chat__last-message");
    if (lastMessageEl) {
      let prefix = "";

      // Ensure we have the correct prefix based on the sender
      if (+senderId === +studentId) {
        prefix = "You: ";
      } else if (senderId && userNameCache.has(senderId)) {
        prefix = `${userNameCache.get(senderId)}: `;
      } else if (senderId) {
        // If we don't have the name cached, fetch it first
        const senderName = userNameCache.get(senderId);
        prefix = `${senderName}: `;
      }
      
      lastMessageEl.textContent = prefix + truncateText(messageContent, 30);

      // Move this chat to the top of the list (most recent)
      const chatsList = chatItem.parentElement;
      if (chatsList && chatsList.firstChild !== chatItem) {
        // Use animation API for smoother transitions
        chatItem.style.transition = "none";
        chatItem.style.opacity = "0.7";
        
        // Move to top
        chatsList.insertBefore(chatItem, chatsList.firstChild);

        // Trigger reflow
        void chatItem.offsetWidth;

        // Animate back to normal
        chatItem.style.transition = "all 0.3s ease";
        chatItem.style.opacity = "1";
      }
    }
  }
}
async function sendMessage(chatId, messageContent) {
  try {
    const timestamp = new Date();

    // Create a temporary visual placeholder for the message with a unique ID
    const tempMessageId = `temp-${Date.now()}`;
    const messagesContainer = document.querySelector(
      ".chat__messages-container"
    );

    // Remove any "empty messages" placeholder if it exists
    const emptyPlaceholder = messagesContainer.querySelector(".empty-messages");
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    // Create temporary message element
    const messageEl = document.createElement("div");
    messageEl.id = tempMessageId;
    messageEl.classList.add("message", "sent", "pending");
    // Add timestamp as data attribute for sorting
    messageEl.setAttribute("data-timestamp", timestamp.getTime());
    messageEl.setAttribute("data-sender-id", studentId);
    // Add custom attribute to identify locally added messages
    messageEl.setAttribute("data-local-message", "true");

    const messageSenderName = document.createElement("p");
    messageSenderName.classList.add("message__sender-name");
    messageSenderName.textContent = "You"; // Always "You" for current user

    const messageContent_el = document.createElement("p");
    messageContent_el.classList.add("message__content");
    messageContent_el.textContent = messageContent;

    const messageTime = document.createElement("p");
    messageTime.classList.add("message__time");
    messageTime.textContent = formatDateTime(timestamp);

    messageEl.appendChild(messageSenderName);
    messageEl.appendChild(messageContent_el);
    messageEl.appendChild(messageTime);

    // Append message to the end for chronological order
    messagesContainer.appendChild(messageEl);

    // Add animation for a smoother appearance
    messageEl.style.opacity = "0";
    messageEl.style.transform = "translateY(10px)";

    // Use requestAnimationFrame for smoother animations
    requestAnimationFrame(() => {
      messageEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      messageEl.style.opacity = "1";
      messageEl.style.transform = "translateY(0)";

      // Scroll to bottom to show the new message
      scrollToBottom();
    });

    // Send the actual message to the database
    const { data, error } = await supaClient
      .from("message")
      .insert({
        chat_id: chatId,
        msg_content: messageContent,
        sender_data: `${studentId}+${userNameCache.get(studentId)}`,
        msg_date_time: timestamp.toISOString(),
      })
      .select();

    if (error) {
      console.error("Error sending message:", error);
      messageEl.classList.add("error");
      messageTime.textContent = "Failed to send";

      // Add retry button
      const retryButton = document.createElement("button");
      retryButton.classList.add("retry-button");
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", () => {
        // Remove the failed message
        messageEl.remove();
        // Try sending again
        sendMessage(chatId, messageContent);
      });
      messageEl.appendChild(retryButton);
    } else {
      console.log("Message sent:", data);

      // Instead of removing the placeholder, just mark it as confirmed and add the ID
      messageEl.classList.remove("pending");
      messageEl.classList.add("confirmed");

      if (data && data[0] && data[0].msg_id) {
        messageEl.setAttribute("data-message-id", data[0].msg_id);

        // Add this message ID to our processed set to prevent duplication
        processedMessageIds.add(data[0].msg_id);
      }

      // Update the chat list manually in case the subscription is slow
      await updateLastMessageInChatList(chatId, messageContent, studentId);
    }
  } catch (err) {
    console.error("Exception sending message:", err);
  }
}
// Check and restore Supabase connection
function checkConnection() {
  // Check all subscriptions
  const needsReconnection = Object.keys(chatSubscriptions).some((chatId) => {
    const sub = chatSubscriptions[chatId];
    return !sub || sub.closed || sub.errored;
  });

  if (needsReconnection) {
    console.log("Restoring chat subscriptions");
    setupAllChatSubscriptions();
  }
}

// Initialize chat list
renderChatList();

// Set up regular connection checks
setInterval(checkConnection, 30000); // Check connection every 30 seconds

// When the page is about to be unloaded, unsubscribe from any active subscription
window.addEventListener("beforeunload", () => {
  // Unsubscribe from all chat subscriptions
  Object.values(chatSubscriptions).forEach((sub) => {
    if (sub) sub.unsubscribe();
  });
});

// A more intelligent visibility change handler that doesn't cause flickering
let visibilityTimeout = null;
document.addEventListener("visibilitychange", () => {
  // Clear any pending timeout
  if (visibilityTimeout) {
    clearTimeout(visibilityTimeout);
  }

  // If the page becomes visible again
  if (document.visibilityState === "visible") {
    // Slight delay to prevent too many reconnection attempts
    visibilityTimeout = setTimeout(() => {
      // Check if we need to reconnect
      if (!isConnected) {
        console.log("Page visible, checking connections");
        checkConnection();
      }

      // If we have an active chat, check for any messages we might have missed
      if (currentChatId) {
        retrieveChatMessages(currentChatId).then((messages) => {
          if (messages && messages.length > 0) {
            // PROBLEM: This is causing the flickering by replacing all message elements
            // renderChatMessages(messages, false);
            setupFileUploadListeners();
            // Instead, check for and only add new messages
            updateMessagesIncrementally(messages);

          }
        });
      }
    }, 10);
  }
});
function updateMessagesIncrementally(messages) {
  const messagesContainer = document.querySelector(".chat__messages-container");
  if (!messagesContainer) return;
  
  // Get existing message IDs for quick lookup
  const existingMessageEls = messagesContainer.querySelectorAll('[data-message-id]');
  const existingMessageIds = new Set();
  existingMessageEls.forEach(el => {
    const msgId = el.getAttribute('data-message-id');
    if (msgId) existingMessageIds.add(msgId);
  });
  
  // Find only messages that we haven't displayed yet
  const newMessages = messages.filter(msg => {
    return msg.msg_id && !existingMessageIds.has(msg.msg_id.toString());
  });
  
  if (newMessages.length === 0) return; // No new messages to add
  
  console.log(`Adding ${newMessages.length} new messages without rebuilding`);
  
  // Sort new messages by timestamp
  newMessages.sort((a, b) => {
    return new Date(a.msg_date_time).getTime() - new Date(b.msg_date_time).getTime();
  });
  
  // Add each new message to the appropriate position in the timeline
  newMessages.forEach(message => {
    const messageEl = createMessageElement(message, true);
    const timestamp = new Date(message.msg_date_time).getTime();
    
    // Find the correct position to insert based on timestamp
    let inserted = false;
    const allMessages = messagesContainer.querySelectorAll('.message');
    for (let i = 0; i < allMessages.length; i++) {
      const existingMsg = allMessages[i];
      const existingTimestamp = parseInt(existingMsg.getAttribute('data-timestamp'), 10) || 0;
      
      if (timestamp < existingTimestamp) {
        messagesContainer.insertBefore(messageEl, existingMsg);
        inserted = true;
        break;
      }
    }
    
    // If we didn't find a place to insert, add to the end
    if (!inserted) {
      messagesContainer.appendChild(messageEl);
    }
    
    // Add to processed IDs set
    processedMessageIds.add(message.msg_id);
  });
  
  // Scroll to bottom if we were already at the bottom
  const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
  if (isAtBottom) {
    scrollToBottom();
  }
}
function isUserComingFrom(pageUrl) {
  const referrer = document.referrer;

  // If there's no referrer, the user either typed the URL directly,
  // used a bookmark, or came from an HTTPS page to an HTTP page
  if (!referrer) {
    return false;
  }

  // Check if the referrer contains the pageUrl string
  // This works for both exact URLs and partial matches
  return referrer.includes(pageUrl);
}

// Example usage:
if (isUserComingFrom("courses.html")) {
  console.log("User came from the courses page");
  // You could automatically open a specific chat
  // openChatByName('Chemistry');
}
function openChatByName(chatName) {
  console.log(`Attempting to open chat: "${chatName}"`);

  // First make sure the chat list is loaded
  return new Promise((resolve, reject) => {
    // Function to check if chats are loaded and find our target
    const findAndOpenChat = () => {
      // Normalize the chat name for case-insensitive comparison
      const normalizedChatName = chatName.trim().toLowerCase();
      console.log(
        `Looking for chat with normalized name: "${normalizedChatName}"`
      );

      // Find the chat item with matching name
      const chatItems = document.querySelectorAll(".chat__item");
      console.log(`Found ${chatItems.length} chat items`);

      let targetChat = null;

      // Log all chat items for debugging
      chatItems.forEach((item) => {
        const itemName = item.getAttribute("data-chat-name");
        console.log(`Available chat: "${itemName}"`);

        if (itemName && itemName.toLowerCase() === normalizedChatName) {
          targetChat = item;
        }
      });

      // If chat not found, try to reload the chat list
      if (!targetChat) {
        console.log(
          `Chat "${chatName}" not found, checking if we need to load chats`
        );

        // Check if chat list is still loading
        const loader = document.querySelector(".loading-chats");
        if (loader) {
          console.log("Chat list is still loading, will retry in 500ms");
          setTimeout(findAndOpenChat, 500);
          return;
        }

        // If no loader but still no chats, try to reload the list
        if (chatItems.length === 0) {
          console.log("No chats found, attempting to reload chat list");
          renderChatList().then(() => {
            setTimeout(findAndOpenChat, 500);
          });
          return;
        }

        console.error(`Chat "${chatName}" not found in the available chats`);
        resolve(false);
        return;
      }

      console.log(`Found target chat: "${chatName}"`);

      // Get the chat image to update the main chat display
      const chatImg = targetChat.querySelector(".chat__img img");
      if (chatImg) {
        chatImgEl.src = chatImg.src;
        console.log("Updated chat image");
      }

      // Remove active class from all chats
      document.querySelectorAll(".chat__item").forEach((item) => {
        item.classList.remove("active");
      });

      // Add active class to the target chat
      targetChat.classList.add("active");
      console.log("Updated active chat classes");

      // Open the chat view
      openChat();
      console.log("Opened chat view");

      const chatId = targetChat.getAttribute("data-chat-id");
      console.log(`Target chat ID: ${chatId}`);

      // Don't reload if we're already on this chat
      if (currentChatId === chatId) {
        console.log("Already on this chat, not reloading");
        resolve(true);
        return;
      }

      // Unsubscribe from previous chat subscription if exists
      if (subscription) {
        subscription.unsubscribe();
        console.log("Unsubscribed from previous chat");
      }

      currentChatId = chatId;

      // Reset processed message IDs when changing chats
      processedMessageIds = new Set();

      // Show loading indicator
      const messagesContainer = document.querySelector(
        ".chat__messages-container"
      );
      if (messagesContainer) {
        messagesContainer.innerHTML =
          '<div class="loading-messages loader"></div>';
        console.log("Added loading indicator");
      }

      // Load chat details and messages
      Promise.all([getChatDetails(chatId), retrieveChatMessages(chatId)])
        .then(([chatDetails, chatMessages]) => {
          console.log("Loaded chat details and messages");

          // Render chat details
          renderChatDetails(chatDetails);

          // Extract all user IDs for parallel name loading
          const userIds = chatMessages.map((msg) => msg.senderid);
          userIds.push(studentId); // Include current user

          // Prefetch all user names before rendering messages
          loadUserNames(userIds).then(() => {
            // Only render if this is still the current chat
            if (currentChatId === chatId) {
              // Render chat messages
              renderChatMessages(chatMessages, false);
              console.log("Rendered chat messages");
            }

            resolve(true);
          });

          // Set up event listener for send button
          setupSendMessageHandler(chatId);

          // Make sure subscription is active for this chat
          setupChatSubscription(chatId);
        })
        .catch((error) => {
          console.error("Error loading messages:", error);
          if (messagesContainer) {
            messagesContainer.innerHTML =
              '<div class="error-messages">Error loading messages. Please try again.</div>';
          }
          resolve(false);
        });
    };

    // Start the process
    findAndOpenChat();
  });
}
// Alternative version that directly simulates a click on the chat item
function openChatByNameSimple(chatName) {
  console.log(`Looking for chat: "${chatName}"`);

  // Wait for the chat list to be loaded
  if (document.querySelector(".loading-chats")) {
    console.log("Chat list still loading, retrying in 500ms");
    setTimeout(() => openChatByNameSimple(chatName), 500);
    return false;
  }

  // Find the chat item with the matching name
  const chatItems = document.querySelectorAll(".chat__item");
  let found = false;

  chatItems.forEach((item) => {
    const itemName = item.getAttribute("data-chat-name");
    if (itemName && itemName.toLowerCase() === chatName.toLowerCase()) {
      console.log(`Found chat "${itemName}", clicking it`);
      // Simulate a click on the chat item
      item.click();
      found = true;
    }
  });

  if (!found) {
    console.error(`Chat "${chatName}" not found`);
    return false;
  }

  return true;
}
async function getCourseName() {
  if (courseId) {
    console.log(courseId);
    const { data, error } = await supaClient
      .from("course")
      .select("*")
      .eq("course_id", courseId);

    if (error) {
      console.error("Error fetching course name:", error);
      showToast("Failed to load course information", "error");
      return;
    }

    if (data && data.length > 0) {
      console.log(data[0].course_name);
      return data[0].course_name;
    }
  }
}
async function getInstructorName(userId) {
    try {
      const { data, error } = await supaClient
        .from("instructor")
        .select("instructor_name")
        .eq("instructor_id", userId)
        .single();

      if (error || !data) {
        return null;
      }
      // Return formatted instructor name
      return data.instructor_name;
    } catch (error) {
      console.error(`Error checking instructor ID ${userId}:`, error);
      return null;
    
  }
}
window.pendingFileUpload = null;
//////////////////////////////////////////////////////////
function setupSendButtonListener() {
  const sendButton = document.querySelector('.send__message-btn');
  const messageInput = document.querySelector('.message__input');
  
  if (!sendButton || !messageInput) {
    console.error("Could not find send button or message input");
    return;
  }
  
  sendButton.addEventListener('click', async () => {
    if (!currentChatId) {
      alert('Please select a chat first');
      return;
    }
    
    // Check if there's a pending file upload
    if (window.pendingFileUpload) {
      const { type, fileName, publicURL, fileType, fileSize } = window.pendingFileUpload;
      
      let messageContent;
      if (type === 'image') {
        messageContent = `[Image: ${fileName}]|IMAGE|${publicURL}`;
      } else {
        messageContent = `[File: ${fileName}]|FILE|${publicURL}|${fileType}|${fileSize}`;
      }
      
      // Send the message with the file information
      await sendMessage(currentChatId, messageContent);
      
      // Remove the upload indicator if it exists
      const uploadIndicator = document.querySelector('.upload-indicator');
      if (uploadIndicator) {
        uploadIndicator.parentNode.removeChild(uploadIndicator);
      }
      
      // Clear the pending file upload
      window.pendingFileUpload = null;
      
      // Reset the message input placeholder
      messageInput.placeholder = "Enter Your Message";
      
      return;
    }
    
    // Regular text message handling
    const message = messageInput.value.trim();
    if (message) {
      await sendMessage(currentChatId, message);
      messageInput.value = '';
    }
  });
  
  // Also handle Enter key in message input
  messageInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendButton.click();
    }
  });
}
function setupFileUploadListeners() {
  // File attachment button
  const fileBtn = document.querySelector('.file__message-btn');
  fileBtn.addEventListener('click', () => {
    console.log("fileBtn");
    
    createFileInput('document');
  });
  
  // Gallery/Image button
  const galleryBtn = document.querySelector('.gallery__message-btn');
  galleryBtn.addEventListener('click', () => {
    createFileInput('image');
  });
  
  // Camera button
  const cameraBtn = document.querySelector('.camera__message-btn');
  cameraBtn.addEventListener('click', () => {
    openCamera();
  });
}

// function createFileInput(type) {
//   // Create a hidden file input
//   const fileInput = document.createElement('input');
//   fileInput.type = 'file';
//   fileInput.style.display = 'none';
  
//   // Set accepted file types
//   if (type === 'image') {
//     fileInput.accept = 'image/*';
//   } else if (type === 'document') {
//     fileInput.accept = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
//   }
  
//   // Trigger click on the input
//   document.body.appendChild(fileInput);
//   fileInput.click();
  
//   // Handle file selection
//   fileInput.addEventListener('change', async (e) => {
//     if (e.target.files && e.target.files[0]) {
//       const file = e.target.files[0];
//       await uploadAndSendFile(file, type);
//     }
    
//     // Remove the input from DOM after selection
//     // document.body.removeChild(fileInput);
//   });
// }
function createFileInput(type) {
  // Create a hidden file input if it doesn't exist already
  let fileInput = document.getElementById('hidden-file-input');
  
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.id = 'hidden-file-input';
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  
  // Set accepted file types
  if (type === 'image') {
    fileInput.accept = 'image/*';
  } else if (type === 'document') {
    fileInput.accept = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
  }
  
  // Reset file input to allow selecting the same file again
  fileInput.value = '';
  
  // Handle file selection
  fileInput.onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await uploadAndSendFile(file, type);
    }
  };
  
  // Trigger click on the input - use setTimeout to ensure UI responsiveness
  setTimeout(() => {
    fileInput.click();
  }, 0);
}
function displayFileInChat(messageElement, messageContent) {
  // Parse the message content
  const parts = messageContent.split('|');
  
  if (parts.length < 3) {
    // Not a file/image message or format is incorrect
    messageElement.textContent = messageContent;
    return;
  }
  
  const type = parts[1]; // IMAGE or FILE
  const url = parts[2];
  
  if (type === 'IMAGE') {
    // Create image element
    const imageContainer = document.createElement('div');
    imageContainer.className = 'message-image-container';
    
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Shared image';
    image.className = 'message-image';
    image.loading = 'lazy';
    
    // Add click to enlarge functionality
    image.addEventListener('click', () => {
      openImageViewer(url);
    });
    
    imageContainer.appendChild(image);
    messageElement.innerHTML = ''; // Clear text content
    messageElement.appendChild(imageContainer);
  } 
  else if (type === 'FILE') {
    // It's a file
    const fileName = parts[0].replace('[File: ', '').replace(']', '');
    const fileType = parts[3] || 'application/octet-stream';
    
    // Create file element
    const fileContainer = document.createElement('div');
    fileContainer.className = 'message-file-container';
    
    // Create file icon based on type
    const fileIcon = document.createElement('div');
    fileIcon.className = 'file-icon';
    fileIcon.innerHTML = getFileIconByType(fileType);
    
    // Create file info
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
      <span class="file-name">${fileName}</span>
      <a href="${url}" download="${fileName}" class="file-download-link">Download</a>
    `;
    
    fileContainer.appendChild(fileIcon);
    fileContainer.appendChild(fileInfo);
    
    messageElement.innerHTML = ''; // Clear text content
    messageElement.appendChild(fileContainer);
  }
}
function getFileIconByType(fileType) {
  if (fileType.includes('pdf')) {
    return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1H11c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2c-.28 0-.5-.22-.5-.5v-5c0-.28.22-.5.5-.5h2c.83 0 1.5.67 1.5 1.5v3zm4-3.75c0 .41-.34.75-.75.75H19v1h.75c.41 0 .75.34.75.75s-.34.75-.75.75H19v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1h1.25c.41 0 .75.34.75.75zM9 9.5h1v-1H9v1zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1zm11 5.5h1v-3h-1v3z"/></svg>';
  } else if (fileType.includes('word') || fileType.includes('doc')) {
    return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
  } else if (fileType.includes('sheet') || fileType.includes('xls')) {
    return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1.94 14H7v-2h10.06v2zm0-4H7v-2h10.06v2zm0-4H7V7h10.06v2z"/></svg>';
  } else if (fileType.includes('presentation') || fileType.includes('ppt')) {
    return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H7v-2h3v2zm0-4H7v-2h3v2zm0-4H7V7h3v2zm4 8h-3v-2h3v2zm0-4h-3v-2h3v2zm0-4h-3V7h3v2zm4 8h-3v-2h3v2zm0-4h-3v-2h3v2zm0-4h-3V7h3v2z"/></svg>';
  } else {
    return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
  }
}
function openImageViewer(imageUrl) {
  const viewer = document.createElement('div');
  viewer.className = 'image-viewer-overlay';
  viewer.innerHTML = `
    <div class="image-viewer-container">
      <img src="${imageUrl}" alt="Full size image" class="image-viewer-image">
      <button class="image-viewer-close">×</button>
    </div>
  `;
  
  document.body.appendChild(viewer);
  
  // Prevent scrolling on the body
  document.body.style.overflow = 'hidden';
  
  // Add close functionality
  const closeButton = viewer.querySelector('.image-viewer-close');
  closeButton.addEventListener('click', () => {
    document.body.removeChild(viewer);
    document.body.style.overflow = '';
  });
  
  // Close on background click
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) {
      document.body.removeChild(viewer);
      document.body.style.overflow = '';
    }
  });
}
function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .message-image-container {
      max-width: 100%;
      margin: 5px 0;
    }
    
    .message-image {
      max-width: 100%;
      max-height: 300px;
      border-radius: 8px;
      cursor: pointer;
    }
    
    .message-file-container {
      display: flex;
      align-items: center;
      background: rgba(89, 85, 179, 0.1);
      border-radius: 8px;
      padding: 8px 12px;
      margin: 5px 0;
    }
    
    .file-icon {
      margin-right: 12px;
      color: #5955B3;
    }
    
    .file-info {
      display: flex;
      flex-direction: column;
    }
    
    .file-name {
      font-size: 14px;
      margin-bottom: 4px;
    }
    
    .file-download-link {
      color: #5955B3;
      font-size: 12px;
      text-decoration: none;
    }
    
    .image-viewer-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    
    .image-viewer-container {
      position: relative;
      max-width: 90%;
      max-height: 90%;
    }
    
    .image-viewer-image {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
    }
    
    .image-viewer-close {
      position: absolute;
      top: -40px;
      right: 0;
      background: none;
      border: none;
      color: white;
      font-size: 32px;
      cursor: pointer;
    }
  `;
  
  document.head.appendChild(style);
}
function initializeFileUpload() {
  // Add necessary styles
  addStyles();
  
  // Setup send button listener 
  setupSendButtonListener();
  
  // Make sure file buttons are initialized
  setupFileUploadListeners();
  
  console.log("File upload system initialized");
}

// Call this function after page load
document.addEventListener('DOMContentLoaded', initializeFileUpload);
function openCamera() {
  // Create a container for the camera
  const cameraContainer = document.createElement('div');
  cameraContainer.className = 'camera-container';
  cameraContainer.innerHTML = `
    <div class="camera-wrapper">
      <video id="camera-preview" autoplay></video>
      <div class="camera-controls">
        <button id="capture-btn">Capture</button>
        <button id="cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(cameraContainer);
  
  // Get video stream
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      const video = document.getElementById('camera-preview');
      video.srcObject = stream;
      
      // Capture button
      document.getElementById('capture-btn').addEventListener('click', () => {
        // Create a canvas to capture the image
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to file
        canvas.toBlob(async (blob) => {
          const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          await uploadAndSendFile(file, 'image');
          
          // Close camera
          closeCamera(stream);
        }, 'image/jpeg');
      });
      
      // Cancel button
      document.getElementById('cancel-btn').addEventListener('click', () => {
        closeCamera(stream);
      });
    })
    .catch(err => {
      console.error('Error accessing camera:', err);
      alert('Could not access camera. Please check permissions.');
      document.body.removeChild(cameraContainer);
    });
}

function closeCamera(stream) {
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  // Remove the camera container
  const container = document.querySelector('.camera-container');
  if (container) {
    document.body.removeChild(container);
  }
}
async function uploadAndSendFile(file, type) {
  if (!currentChatId) {
    alert('Please select a chat first');
    return;
  }
  console.log(currentChatId);
  console.log(file);
  console.log(type);
  
  // Show upload progress indicator
  const messagesContainer = document.querySelector('.chat__messages-container');
  const uploadIndicator = document.createElement('div');
  uploadIndicator.className = 'upload-indicator message sent';
  uploadIndicator.innerHTML = `
    <p class="message__sender-name">You</p>
    <p class="message__content">Uploading ${file.name}...</p>
    <div class="upload-progress">
      <div class="upload-progress-bar"></div>
    </div>
  `;
  messagesContainer.appendChild(uploadIndicator);
  scrollToBottom();
  
  try {
    // Generate a unique file path
    const filePath = `${currentChatId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`.replaceAll('/', '');
    
    // Upload to Supabase Storage
    const { data, error } = await supaClient.storage
      .from('chat-attachments')
      .upload(filePath, file);
      
    if (error) throw error;
    
    // Get the public URL for the file - FIXED THIS PART
    const publicURL = supaClient.storage
      .from('chat-attachments')
      .getPublicUrl(filePath).data.publicUrl;
    console.log(publicURL);
    
    console.log("File uploaded successfully, public URL:", publicURL);
      
    // Prepare message content based on file type
    let messageContent;
    if (type === 'image') {
      messageContent = `[Image: ${file.name}]|IMAGE|${publicURL}`;
    } else {
      messageContent = `[File: ${file.name}]|FILE|${publicURL}|${file.type}|${file.size}`;
    }
    
    // Send the message with the file information
    await sendMessage(currentChatId, messageContent);
    
    // Remove the upload indicator
    messagesContainer.removeChild(uploadIndicator);
  } catch (error) {
    console.error('Error uploading file:', error);
    uploadIndicator.innerHTML = `
      <p class="message__sender-name">You</p>
      <p class="message__content">Failed to upload ${file.name}</p>
      <p class="message__time">Error: ${error.message}</p>
    `;
  }
}