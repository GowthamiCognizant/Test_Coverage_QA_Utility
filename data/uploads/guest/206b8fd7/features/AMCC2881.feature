Feature: Homepage Widgets - Validation and Data Consistency

  Background:
    Given User logs in to the Americold Compass application with valid credentials
    Then Home page should be displayed '<homepageTitle>' 
    Examples:
      | homepageTitle  |
      | generic |

  

@homepage-widgets @regression @amcc-tc-8783
Scenario Outline: AMCC-TC-8783 Validation of pallets aged over 90 days
#   When Verify Inventory Aging > 90 Days widget is displayed on the dashboard
#   And Note down the count of pallets aged over 90 days from the widget
#   When Navigate to Reports -> Inventory -> Lot Level Inventory
#   And Select Facility '<facility>' and Customer '<customer>' from '<inputdata>' test data
#   Then Verify the total pallets count matches the widget count noted earlier

# Examples:
#   | inputdata   | facility       | customer       | dateRange      |
#   | AMCC-TC-8783 | All Facility   | All Customers  | Last 90 days   |

# @homepage-widgets @regression @amcc-tc-8782
# Scenario Outline: AMCC-TC-8782 Validation of On Orders count for top 5 facilities
#   When Verify Top 5 Inventory Snapshot widget is displayed on the dashboard
#   And Select Inventory Status On Orders and note pallet counts for top 5 facilities
#   When For each noted facility Navigate to Reports -> Inventory -> Lot Level Inventory
#   And Select Facility '<facility>' and Customer '<customer>' and Inventory Status On Orders and Click Search
#   Then Relevant data should be displayed and total pallets count should match the noted count for that facility

# Examples:
#   | inputdata   | facility       | customer       |
#   | AMCC-TC-8782 | <from widget>  | All Customers  |

@homepage-widgets @regression @amcc-tc-8781
Scenario Outline: AMCC-TC-8781 Validation of On Hold count for top 5 facilities
#   When Verify Top 5 Inventory Snapshot widget is displayed on the dashboard
#   And Select Inventory Status On Hold and note pallet counts for top 5 facilities
#   When For each noted facility Navigate to Reports -> Inventory -> Lot Level Inventory
#   And Select Facility '<facility>' and Customer '<customer>' and Inventory Status On Hold and Click Search
#   Then Relevant data should be displayed and total pallets count should match the noted count for that facility

# Examples:
#   | inputdata   | facility       | customer       |
#   | AMCC-TC-8781 | <from widget>  | All Customers  |

@homepage-widgets @regression @amcc-tc-8780
Scenario Outline: AMCC-TC-8780 Validation of On Hand count for top 5 facilities
#   When Verify Top 5 Inventory Snapshot widget is displayed on the dashboard
#   And Ensure Inventory Status On Hand is selected and note pallet counts for top 5 facilities
#   When For each noted facility Navigate to Reports -> Inventory -> Lot Level Inventory
#   And Select Facility '<facility>' and Customer '<customer>' and Inventory Status 'On Hand' and Click Search
#   Then Relevant data should be displayed and total pallets count should match the noted count for that facility

# Examples:
#   | inputdata | facility       | customer       |
#   | AMCC-TC-8780 | <from widget>  | All Customers  |


  @homepage-widgets @regression @amcc-tc-6814
  Scenario Outline: AMCC-TC-6814 Validation of daily trend icon and increase/decrease sign
  #   When Verify Inventory Aging > 90 Days widget is displayed for '<inputdata>'
  #   Then Pallets aged >90 days should show large red count, info icon, daily trend icon, and + or - sign reflecting increase/decrease
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6814 |

  @homepage-widgets @regression @amcc-tc-6810
  Scenario Outline: AMCC-TC-6810 Verifying clicking view report displays Lot Level report screen
  #   When Verify Inventory Aging > 90 Days widget is displayed for '<inputdata>'
  #   And Click View Report
  #   Then User should be redirected to Lot Level Inventory Report home page
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6810 |

  @homepage-widgets @regression @amcc-tc-6806
  Scenario Outline: AMCC-TC-6806 Verifying clicking view detailed inventory displays Lot Level report screen
  #   When Verify Top 5 Inventory Snapshot summary is displayed for '<inputdata>'
  #   And Click View Detailed Inventory
  #   Then User should be redirected to Lot Level Inventory home page
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6806 |

  @homepage-widgets @regression @amcc-tc-6804
  Scenario Outline: AMCC-TC-6804 Verifying top 5 Facilities data are displayed from Lot Level Inventory report
  #   When Verify Top 5 Inventory Snapshot summary is displayed for '<inputdata>'
  #   Then Top 5 facilities data should be fetched from Lot Level Inventory and displayed in the widget
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6804 |

    
