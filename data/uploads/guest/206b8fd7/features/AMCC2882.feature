Feature: Homepage Widgets - Validation and Data Consistency

  Background:
    Given User logs in to the Americold Compass application with valid credentials
    Then Home page should be displayed '<homepageTitle>' 
    Examples:
      | homepageTitle          |
      | generic |

  @homepage-widgets @regression @amcc-tc-8411
  Scenario Outline: AMCC-TC-8411 Validation of total available slots
  #   When Verify Available Appointments widget is displayed and set Facility , Customer and Date Range Today '<inputdata>'
  #   And Note down Total available slots count
  #   When Navigate to Americold apps -> Online appointment Scheduling, select warehouse and create a schedule to view available slots for current date
  #   Then Verify total slots available equals the widget count noted earlier
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-8411 | 

  @homepage-widgets @regression @amcc-tc-8410
  Scenario Outline: AMCC-TC-8410 Validation of total scheduled count by scheduling an appointment
  #   When Verify Appointments widget is displayed and set Facility, Customer and Date Range Today '<inputdata>'
  #   And Note down Total Scheduled count
  #   When Navigate to Americold apps -> Online appointment Scheduling and create one appointment for current date with service type Ventura Inbounds
  #   And Return to the homepage and refresh the Appointments widget with same Facility/Customer/Date Range
  #   Then Verify Total Scheduled count has increased by 1
  # Examples:
  #   | inputdata   | 
  #   | AMCC-TC-8410 | 

  @homepage-widgets @regression @amcc-tc-8409
  Scenario Outline: AMCC-TC-8409 Validation of total delayed count
  #   When Verify Appointments widget is displayed and set Facility , Customer  and Date Range Last 7 Days
  #   And Note down Total delayed count
  #   When Navigate to Americold apps -> Online appointment Scheduling, set date range to Last 7 days and filter Status = Not Arrived
  #   And Click Search and use search keyword '<inputdata>'
  #   Then Verify total delayed appointment count matches the widget count
  # Examples:
  #   | inputdata  | 
  #   | AMCC-TC-8409 | 

 @homepage-widgets @regression @amcc-tc-8408
  Scenario Outline: AMCC-TC-8408 Validation of total expected count
  #   When Verify Appointments widget is displayed and set Facility ,Customer and Date Range Last 7 Days
  #   And Note down Total expected count
  #   When Navigate to Americold apps -> Online appointment Scheduling, set date range to Last 7 days and filter Status = Dispatched
  #   And Click Search and use search keyword '<inputdata>'
  #   Then Verify total expected appointment count matches the widget count
  # Examples:
  #   | inputdata  | 
  #   | AMCC-TC-8408 | 
@homepage-widgets @regression @amcc-tc-8407
  Scenario Outline: AMCC-TC-8407 Validation of total arrived count
  #   When Verify Appointments widget is displayed and set Facility , Customer and Date Range Last 7 Days
  #   And Note down Total Arrived count
  #   When Navigate to Americold apps -> Online appointment Scheduling, set date range to Last 7 days and filter Status = Arrived
  #   And Click Search and use search keyword '<inputdata>'
  #   Then Verify total arrived appointment count matches the widget count
  #   When Optionally update an appointment status to Arrived via Open Doc and confirm widget increments by 1
  # Examples:
  #   | inputdata | 
  #   | AMCC-TC-8407 | 

 @homepage-widgets @regression @amcc-tc-8406
  Scenario Outline: AMCC-TC-8406 Validation of total cancelled count
    When Verify Appointments widget is displayed and set Facility , Customer , Date Range Today
    And Note down Total Cancelled count
    When Navigate to Americold apps -> Online appointment Scheduling and locate a Scheduled appointment for today
    And Click Trash/Delete, provide reason and cancel appointment
    Then Return to homepage and verify Total Cancelled count increased by 1

 @homepage-widgets @regression @amcc-tc-8405
  Scenario Outline: AMCC-TC-8405 Validation of total scheduled count (zero and confirm)
  #   When Verify Appointments widget is displayed and set Facility , Customer  and Date Range Last 7 Days '<inputdata>'
  #   Then Verify Total Scheduled count is displayed as 0
  #   When Navigate to Online appointment Scheduling and view today's schedules using search 
  #   Then Verify scheduled and confirmed appointments count is 0
  #   When Return to homepage and set Date Range Today" then note Total Scheduled count
  #   When Navigate to Online appointment Scheduling and search today's schedules using
  #   Then Verify the scheduled and confirmed appointment count equals the noted value
  # Examples:
  #   | inputdata  | 
  #   | AMCC-TC-8405 | 

   @homepage-widgets @regression @amcc-tc-6836
  Scenario Outline: AMCC-TC-6836 Verifying clicking Schedule Appointment displays Schedule Appointment page
  #   When Verify Available Appointments widget is displayed for '<inputdata>'
  #   And Click Schedule Appointment
  #   Then User should be redirected to Schedule Appointment page with warehouse pre-selected
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6836 |

   @homepage-widgets @regression @amcc-tc-6835
  Scenario Outline: AMCC-TC-6835 Verifying clicking Track Appointments displays OLAS screen
  #   When Verify Appointments widget is displayed for '<inputdata>'
  #   And Click Track Appointments
  #   Then User should be redirected to Online Appointment Scheduling page showing Scheduled and Confirmed appointments for the date range
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6835 |

   @homepage-widgets @regression @amcc-tc-6822
  Scenario Outline: AMCC-TC-6822 Validation of Appointment categories
  #   When Verify Appointments widget is displayed for '<inputdata>'
  #   Then Appointments should be grouped by Arrived, Expected, Delayed, Cancelled
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6822 |