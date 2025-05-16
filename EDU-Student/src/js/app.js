// const { createClient } = supabase;
// const supabaseProjectUrl = "https://iuiwdjtmdeempcqxeuhf.supabase.co";
// const supabaseKey =
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1aXdkanRtZGVlbXBjcXhldWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3NTY1MDcsImV4cCI6MjA2MDMzMjUwN30.XfSmnKA8wbsXIA1qkfYaRkzxtEdudIDNYbSJu-M5Zag";
// export const supaClient = createClient(supabaseProjectUrl, supabaseKey);
const { createClient } = supabase;
const supabaseProjectUrl = "https://nwwqsqkwmkkuunczucdm.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53d3FzcWt3bWtrdXVuY3p1Y2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1MzEyODIsImV4cCI6MjA2MjEwNzI4Mn0.EF6CGrpM3bjxBo4-ItU3S1BPjfVHdv2HnvoeAdfPZug";
export const supaClient = createClient(supabaseProjectUrl, supabaseKey);
const studentId = sessionStorage.getItem("studentId");
const logOutButton = document.querySelector(".log-out");
logOutButton.addEventListener("click", logOut);
// Option 1: Using CDN
//////////////////////////////////////////////////////
// console.log(window.location.href === "index.html");
// console.log(window.location.href.includes("index.html"));
function isUserLoggedIn() {
  if (!studentId && !window.location.href.includes("index.html")) {
    alert("sign in first");
    window.location.href = "../../../index.html"; // Redirect to the sign-in page
    return;
  }
}
isUserLoggedIn();
export async function getUserName(studentId) {
  const { data, error } = await supaClient
    .from("student")
    .select("student_name")
    .eq("student_id", studentId);
  if (error) {
    console.error("Error fetching student name:", error);
    return null;
  }
  if (data && data.length > 0) {
    // const name = data[0].student_name;
    // userName.textContent = name;
    return data[0].student_name;
  }
}
function logOut() {
  const confirmation = confirm("Are you sure you want to log out!");
  if (!confirmation) return;
  sessionStorage.removeItem("studentId");
  sessionStorage.removeItem("courseId");
  window.location.href = "../../../index.html";
}

// async function test() {
//   const { data, error } = await supaClient
//     .from("enrollment")
//     .select("*")
//     .eq("student_id", studentId);
//   if (error) {
//     console.error("Error fetching student:", error);
//     return null;
//   }
//   if (data) {
//     data.forEach(async (element) => {
//       const courseId = element.course_id;
//       const { data, error } = await supaClient
//         .from("session")
//         .select("*")
//         .eq("course_id", courseId);
//       if (error) {
//         console.error("Error fetching course:", error);
//         return null;
//       }
//       if (data) {
//         console.log("Course data:", data);
//       }
//     });
//   }
//   return data;
// }
// test();

export async function getInstitutionId(studentId) {
  console.log("Entering getInstitutionId with studentId:", studentId);
  const { data, error } = await supaClient
    .from("student")
    .select("institution_id")
    .eq("student_id", studentId);

  if (error) {
    console.error("Error fetching institution_id:", error);
    return null;
  }
  if (data && data.length > 0) {
    const institutionId = data[0].institution_id;
    console.log("Fetched institution_id:", institutionId);
    sessionStorage.setItem("institution_id", institutionId);
    return institutionId;
  } else {
    console.log("No data found for studentId:", studentId);
    return null;
  }
}
async function getInstitutionName() {
  const institutionId = sessionStorage.getItem("institution_id");
  const { data, error } = await supaClient
    .from("institution")
    .select("institution_name")
    .eq("institution_id", +institutionId);
  if (error) {
    console.error("Error fetching student name:", error);
    return null;
  }
  if (data && data.length > 0) {
    sessionStorage.setItem("institution_name", data[0].institution_name);
    return data[0].institution_name;
  }
}
getInstitutionName().then((institutionName) => {
  if (institutionName) {
    console.log("Institution Name:", institutionName);
  } else {
    console.log("No institution name found for the given institution ID.");
  }
});
export function isInstitutionSchool() {
  const institutionName = sessionStorage.getItem("institution_name");
  const institutionId = sessionStorage.getItem("institution_id");
  if (
    (institutionName && institutionName.toLowerCase().includes("school")) ||
    institutionId === "school_id" // Replace with actual school institution ID if known
  ) {
    console.log("Institution is a school.");
    return true;
  } else {
    console.log("Institution is not a school.");
    return false;
  }
}
isInstitutionSchool();
