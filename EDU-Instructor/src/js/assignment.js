////////////////////// VERSION 5 //////////////////////////////
import { supaClient } from "./main.js";
import { isInstitutionSchool } from "./main.js";
// Get instructorId from session storage
const instructorId = sessionStorage.getItem("instructorId");

// DOM elements
let courseNameSelect = document.getElementById("course-name");
const assignmentListBody = document.getElementById("assignmentListBody");
const submissionListBody = document.getElementById("submissionListBody");
const assignmentTitleInput = document.getElementById("assignmentTitle");
const assignmentDescriptionInput = document.getElementById(
  "assignmentDescription"
);
const dueDateInput = document.getElementById("dueDate");
const submitAssignmentBtn = document.getElementById("submitAssignment");
const successMessage = document.getElementById("successMessage");
const today = new Date().toISOString().slice(0, 16);
dueDateInput.min = today;
// Get courses with enrollment counts for the instructor
async function getCoursesWithEnrollmentCounts(instructorId) {
  try {
    // Step 1: Fetch all enrollments for this instructor
    const { data: enrollments, error } = await supaClient
      .from("enrollment")
      .select("course_id")
      .eq("instructor_id", instructorId);

    if (error) {
      console.error("Error fetching enrollments:", error);
      return [];
    }

    // Step 2: Get unique course_ids
    const uniqueCourses = [...new Set(enrollments.map((e) => e.course_id))];

    // Step 3: For each course_id, count number of students
    const results = [];
    for (let courseId of uniqueCourses) {
      const { count, error: countError } = await supaClient
        .from("enrollment")
        .select("student_id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("instructor_id", instructorId);

      if (countError) {
        console.error(
          `Error counting students for course ${courseId}:`,
          countError
        );
      } else {
        results.push({ course_id: courseId, student_count: count });
      }
    }
    return results;
  } catch (error) {
    console.error("Error in getCoursesWithEnrollmentCounts:", error);
    return [];
  }
}

// Get course details for the instructor
async function getInstructorCourses() {
  try {
    const instructorCourses = await getCoursesWithEnrollmentCounts(
      instructorId
    );

    if (!instructorCourses || instructorCourses.length === 0) {
      return [];
    }

    const { data, error } = await supaClient
      .from("course")
      .select("*")
      .in(
        "course_id",
        instructorCourses.map((c) => c.course_id)
      );

    if (error) {
      console.error("Error fetching instructor courses:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getInstructorCourses:", error);
    return [];
  }
}

// Get assignments for a specific course
async function getInstructorAssignments(courseId) {
  try {
    if (!courseId) {
      const instructorCourses = await getInstructorCourses();
      if (instructorCourses && instructorCourses.length > 0) {
        courseId = instructorCourses[0].course_id;
      } else {
        return [];
      }
    }

    const { data, error } = await supaClient
      .from("assignment")
      .select("*")
      // .eq("instructor_id", instructorId)
      .eq("course_id", courseId);

    if (error) {
      console.error("Error fetching assignments:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getInstructorAssignments:", error);
    return [];
  }
}

// Render assignments in the table
async function renderInstructorAssignments(courseId) {
  try {
    const assignments = await getInstructorAssignments(courseId);

    // Clear existing assignments
    assignmentListBody.innerHTML = "";

    if (!assignments || assignments.length === 0) {
      assignmentListBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center;">No assignments found for this course</td>
        </tr>`;
      return;
    }

    // Create HTML for each assignment
    assignments.forEach((assignment, index) => {
      const row = document.createElement("tr");

      // Format the date properly
      const dueDate = new Date(assignment.assign_duedate);
      const formattedDate = dueDate.toLocaleDateString();

      row.innerHTML = `
        <td>
          <span class="assignment-number">${index + 1}</span> ${
        assignment.assign_title
      }
        </td>
        <td>${formattedDate}</td>
        <td><p class="show__assignment-details" data-id="${
          assignment.assign_id
        }">View</p></td>
      `;

      assignmentListBody.appendChild(row);
    });

    // Add event listeners to view buttons
    document.querySelectorAll(".show__assignment-details").forEach((button) => {
      button.addEventListener("click", () => {
        const assignId = button.getAttribute("data-id");
        showAssignmentDetails(assignId);
      });
    });

    // After rendering assignments, render the student submissions for this course
    renderStudentSubmissionsForCourse(courseId);
  } catch (error) {
    console.error("Error in renderInstructorAssignments:", error);
    assignmentListBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center;">Error loading assignments</td>
      </tr>`;
  }
}

// Show assignment details in a modal
async function showAssignmentDetails(assignId) {
  try {
    // Fetch assignment details
    const { data, error } = await supaClient
      .from("assignment")
      .select("*")
      .eq("assign_id", assignId)
      .single();

    if (error) {
      console.error("Error fetching assignment details:", error);
      alert("Failed to load assignment details");
      return;
    }

    if (!data) {
      alert("Assignment not found");
      return;
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById("assignmentDetailsModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "assignmentDetailsModal";
      modal.className = "modal";

      // Create modal content
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close-modal">&times;</span>
          <h2 id="modal-title">Assignment Details</h2>
          <div id="modal-body">
            <div class="detail-row">
              <strong>Title:</strong>
              <span id="modal-assignment-title"></span>
            </div>
            <div class="detail-row">
              <strong>Description:</strong>
              <p id="modal-assignment-description"></p>
            </div>
            <div class="detail-row">
              <strong>Due Date:</strong>
              <span id="modal-assignment-duedate"></span>
            </div>
          </div>
        </div>
      `;

      // Add modal to the body
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector(".close-modal");
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });

      // Close modal when clicking outside
      window.addEventListener("click", (event) => {
        if (event.target === modal) {
          modal.style.display = "none";
        }
      });
    }

    // Populate modal with assignment details
    document.getElementById("modal-title").textContent = "Assignment Details";
    document.getElementById("modal-assignment-title").textContent =
      data.assign_title;
    document.getElementById("modal-assignment-description").textContent =
      data.assign_description;

    // Format due date
    const dueDate = new Date(data.assign_duedate);
    const formattedDate = dueDate.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    document.getElementById("modal-assignment-duedate").textContent =
      formattedDate;

    // Show the modal
    modal.style.display = "block";
  } catch (error) {
    console.error("Error showing assignment details:", error);
    alert("Failed to display assignment details");
  }
}

// Initialize the course dropdown and load assignments
async function initializeAssignmentPage() {
  try {
    // Clear course dropdown
    courseNameSelect.innerHTML = "";

    // Get instructor courses
    const courses = await getInstructorCourses();

    if (!courses || courses.length === 0) {
      courseNameSelect.innerHTML = `<option value="">No courses available</option>`;
      assignmentListBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center;">No courses available</td>
        </tr>`;
      submissionListBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center;">No courses available</td>
        </tr>`;
      return;
    }

    // Reset the event listener to prevent duplicates
    const oldCourseNameSelect = courseNameSelect.cloneNode(false);
    courseNameSelect.parentNode.replaceChild(
      oldCourseNameSelect,
      courseNameSelect
    );
    courseNameSelect = document.getElementById("course-name"); // Reselect the element

    // Populate course dropdown
    courses.forEach((course) => {
      const option = document.createElement("option");
      option.value = course.course_id;
      option.textContent = course.course_name;
      courseNameSelect.appendChild(option);
    });

    // Get the first course ID as default
    const defaultCourseId = courses[0].course_id;

    // Set the dropdown to the default course
    courseNameSelect.value = defaultCourseId;

    // Display assignments for the default course
    renderInstructorAssignments(defaultCourseId);

    // Add event listener for course selection change
    courseNameSelect.addEventListener("change", (e) => {
      const selectedCourseId = e.target.value;
      renderInstructorAssignments(selectedCourseId);
    });
  } catch (error) {
    console.error("Error initializing assignment page:", error);
  }
}

// Submit a new assignment
async function submitAssignment() {
  try {
    // Validate inputs
    const courseId = courseNameSelect.value;
    const title = assignmentTitleInput.value.trim();
    const description = assignmentDescriptionInput.value.trim();
    const dueDate = dueDateInput.value.trim();

    if (!courseId || !title || !description || !dueDate) {
      alert("Please fill in all fields");
      return;
    }

    // Parse date
    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      alert("Please enter a valid date in the format mm/dd/yyyy --:-- --");
      return;
    }
    if (parsedDate < new Date()) {
      alert("Due date cannot be in the past");
      return;
    }

    // Disable button to prevent multiple submissions
    submitAssignmentBtn.disabled = true;

    // Insert new assignment
    const { data, error } = await supaClient.from("assignment").insert([
      {
        instructor_id: instructorId,
        course_id: courseId,
        assign_title: title,
        assign_description: description,
        assign_duedate: parsedDate.toISOString(),
      },
    ]);

    if (error) {
      console.error("Error submitting assignment:", error);
      alert("Failed to submit assignment");
      submitAssignmentBtn.disabled = false;
      return;
    }

    // Clear form
    assignmentTitleInput.value = "";
    assignmentDescriptionInput.value = "";
    dueDateInput.value = "";

    // Show success message
    successMessage.style.display = "block";
    setTimeout(() => {
      successMessage.style.display = "none";
    }, 3000);

    // Refresh assignment list
    renderInstructorAssignments(courseId);

    // Re-enable button
    submitAssignmentBtn.disabled = false;
  } catch (error) {
    console.error("Error in submitAssignment:", error);
    alert("An error occurred while submitting the assignment");
    submitAssignmentBtn.disabled = false;
  }
}

// Add event listener for form submission
submitAssignmentBtn.addEventListener("click", submitAssignment);

///////////////////////  GET STUDENTS ASSIGNMENTS /////////////////////

// Get assignment IDs for a specific course
async function getAssignmentIDsForCourse(courseId) {
  try {
    const { data, error } = await supaClient
      .from("assignment")
      .select("assign_id")
      // .eq("instructor_id", instructorId)
      .eq("course_id", courseId);

    if (error) {
      console.error("Error fetching assignment IDs for course:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getAssignmentIDsForCourse:", error);
    return [];
  }
}

// Get student submissions for specific assignments
async function getStudentSubmissionsForAssignments(assignmentIds) {
  try {
    if (!assignmentIds || assignmentIds.length === 0) {
      return [];
    }

    const { data, error } = await supaClient
      .from("student_assignment")
      .select("*")
      .in(
        "assign_id",
        assignmentIds.map((a) => a.assign_id)
      )
      .neq("assign_path", null);

    if (error) {
      console.error("Error fetching student submissions:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getStudentSubmissionsForAssignments:", error);
    return [];
  }
}

// Get assignment details
async function getAssignmentDetails(assignmentIds) {
  try {
    if (!assignmentIds || assignmentIds.length === 0) {
      return [];
    }

    const { data, error } = await supaClient
      .from("assignment")
      .select("*")
      .in("assign_id", assignmentIds);

    if (error) {
      console.error("Error fetching assignment details:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getAssignmentDetails:", error);
    return [];
  }
}

// Get student details
async function getStudentDetails(studentIds) {
  try {
    if (!studentIds || studentIds.length === 0) {
      return [];
    }

    const { data, error } = await supaClient
      .from("student")
      .select("*")
      .in("student_id", studentIds);

    if (error) {
      console.error("Error fetching student details:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getStudentDetails:", error);
    return [];
  }
}

// Render student submissions for a specific course
async function renderStudentSubmissionsForCourse(courseId) {
  try {
    // Clear existing submissions
    submissionListBody.innerHTML = "";

    // Get assignment IDs for the selected course
    const assignmentIds = await getAssignmentIDsForCourse(courseId);

    if (!assignmentIds || assignmentIds.length === 0) {
      submissionListBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center;">No assignments found for this course</td>
        </tr>`;
      return;
    }

    // Get student submissions for these assignments
    const submissions = await getStudentSubmissionsForAssignments(
      assignmentIds
    );

    if (!submissions || submissions.length === 0) {
      submissionListBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center;">No student submissions found for this course</td>
        </tr>`;
      return;
    }

    // Get details for assignments and students
    const assignmentDetails = await getAssignmentDetails([
      ...new Set(submissions.map((s) => s.assign_id)),
    ]);

    const studentDetails = await getStudentDetails([
      ...new Set(submissions.map((s) => s.student_id)),
    ]);

    // Create HTML for each submission
    let markup = "";
    submissions.forEach((submission) => {
      const student = studentDetails.find(
        (s) => s.student_id === submission.student_id
      );
      const assignment = assignmentDetails.find(
        (a) => a.assign_id === submission.assign_id
      );

      if (student && assignment) {
        // <td>${student.student_id}</td>
        markup += `<tr>
                    <td>${student.student_name || "Unknown Student"}</td>

                    <td>${assignment.assign_title || "Unknown Assignment"}</td>
                    <td><a target="_blank" href="${
                      submission.assign_path
                    }" class="view-submission-button">View</a></td>
                  </tr>`;
      }
    });

    submissionListBody.innerHTML =
      markup ||
      `
      <tr>
        <td colspan="4" style="text-align: center;">Could not display submissions properly</td>
      </tr>`;
  } catch (error) {
    console.error("Error in renderStudentSubmissionsForCourse:", error);
    submissionListBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center;">Error loading student submissions</td>
      </tr>`;
  }
}

// Initialize the page only once when the DOM is loaded
let initialized = false;

document.addEventListener("DOMContentLoaded", () => {
  if (initialized) return;

  // Check if instructor ID exists
  if (!instructorId) {
    console.error("No instructor ID found in session storage");
    alert("Please log in as an instructor");
    window.location.href = "index.html"; // Redirect to login page
    return;
  }

  initializeAssignmentPage();
  setupSearchFunctionality();
  initialized = true;
});
function setupSearchFunctionality() {
  const searchInput = document.querySelector(".search__input");

  searchInput.addEventListener("input", function (e) {
    const searchTerm = e.target.value.toLowerCase();

    // Get all rows in the submission table
    const rows = document.querySelectorAll("#submissionListBody tr");

    // Loop through each row and hide/show based on search term
    rows.forEach((row) => {
      const studentName = row
        .querySelector("td:first-child")
        .textContent.toLowerCase();
      const assignmentName = row
        .querySelector("td:nth-child(2)")
        .textContent.toLowerCase();

      // If search term is found in either student name or project title, show the row
      if (
        studentName.includes(searchTerm) ||
        assignmentName.includes(searchTerm)
      ) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    });

    // Check if no results are found
    const visibleRows = Array.from(rows).filter(
      (row) => row.style.display !== "none"
    );

    if (visibleRows.length === 0 && searchTerm !== "") {
      // If there's already a "no results" message, don't add another one
      if (!document.querySelector("#noResultsRow")) {
        const noResultsRow = document.createElement("tr");
        noResultsRow.id = "noResultsRow";
        noResultsRow.innerHTML = `
          <td colspan="3" style="text-align: center;">No matching results found</td>
        `;
        submissionListBody.appendChild(noResultsRow);
      }
    } else {
      // Remove "no results" message if it exists
      const noResultsRow = document.querySelector("#noResultsRow");
      if (noResultsRow) {
        noResultsRow.remove();
      }
    }
  });
}
if (isInstitutionSchool()) {
  document.querySelectorAll(".key-change").forEach((title) => {
    title.textContent = title.textContent.replace("Assignment", "Homework");
  });
}
