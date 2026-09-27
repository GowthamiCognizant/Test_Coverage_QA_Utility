Feature: Dashboard and Reports Data Synchronisation

  Background:
    Given User logs in to the Americold Compass application with valid credentials
    Then Home page should be displayed '<homepageTitle>'
    Examples:
      | homepageTitle |
      | generic       |

  @dashboard-reports-sync @regression @amcc-tc-7099
  Scenario Outline: AMCC-TC-7099 Data Not in Sync: Dashboard Widgets vs. Reports
    When User navigates to the Dashboard and notes down the data displayed in all visible widgets for '<testData>'
    And User records the widget values for Orders, Inventory, and Shipments from the Dashboard
    When User navigates to Reports section and applies the same Facility, Customer, and Date Range filters used on the Dashboard
    And User retrieves the corresponding data from the Reports for Orders, Inventory, and Shipments
    Then The data displayed in the Dashboard widgets should match the data returned in the Reports
    And There should be no discrepancy between Dashboard widget counts and Report totals for '<testData>'
    Examples:
      | testData    |
      | AMCC-TC-7099 |